// Bound stalled network calls without automatically retrying writes.
export async function requestWithTimeout(input, options={}, timeoutMs=45000, fetcher=globalThis.fetch) {
  const controller=new AbortController()
  const upstream=options.signal || (typeof Request!=='undefined' && input instanceof Request ? input.signal : null)
  let timer,abortListener,rejectCancellation
  const cancelled=new Promise((_,reject)=>{rejectCancellation=reject})
  abortListener=()=>{controller.abort(upstream.reason);rejectCancellation(upstream.reason || new DOMException('Request cancelled','AbortError'))}
  if(upstream?.aborted) { abortListener(); return cancelled }
  upstream?.addEventListener('abort',abortListener,{once:true})
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    const error=new Error('The connection took too long. Check your connection and try again. If you were saving, check whether the change saved first.')
    controller.abort(error);reject(error)
  },timeoutMs)})
  try {return await Promise.race([fetcher(input,{...options,signal:controller.signal}),timeout,cancelled])}
  finally {clearTimeout(timer);upstream?.removeEventListener('abort',abortListener)}
}
