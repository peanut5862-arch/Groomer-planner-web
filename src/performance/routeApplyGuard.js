export function routeApplyBlock({proposal,end,role,allowLate=false,acceptedWarnings=false}){
 if(!proposal)return 'Plan the day first.'
 if(!proposal.items.some(stop=>!stop.completed))return 'All stops are completed. There are no remaining appointments to update.'
 if(proposal.items.some(stop=>stop.fixed&&stop.arrival!==stop.scheduled))return 'Resolve the fixed-time conflict before applying this route.'
 if(proposal.homeArrival>end&&!(role==='owner'&&allowLate))return role==='owner'?'This route returns after Home by. Move a stop, or allow a late return for this day.':'This route returns after Home by. An owner must approve a late return.'
 if(proposal.warnings.length&&!acceptedWarnings)return 'Review and accept the timing warnings before applying.'
 return ''
}
