import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from "../supabase.js";
import { CalendarDays, ChevronRight, Clock3, Dog, Plus, Search, Users, WalletCards, X, MessageCircle } from 'lucide-react';
import { messageDateLabel, dismissFormKeyboard, confirmationMessage, paymentPreferenceKey, paymentMethodDetails, openSms, openCall, businessDateKey, mondayForDate, displayClockTime, serviceDefaultsForDog, defaultFirstStopTime, schedulingOverrideReasons, canonicalServiceLabel, appointmentServiceOptions, dogDueInfo, clientDueInfo, canonicalAreaLabel } from './shared.jsx'

const PAYMENT_METHOD_OPTIONS = ['Cash','Check','Venmo','PayPal','Cash App','Zelle','Apple Pay','Cash/Check']

function rebookingMessage({owner,date}) {
  const first = String(owner || '').trim().split(/\s+/)[0] || 'there'
  const dateLabel = messageDateLabel(date)
  return `Hi ${first}! We are in your area on ${dateLabel}. Are you ready for grooming again?`
}

function Clients({ dogs, loading, error, onOpen, revision, onDataChanged, openClient, onOpenClientHandled, onRebook, viewerMode=false, userId='' }) {
  const draftKey = userId && !viewerMode ? `grooming-planner:new-client:v1:${userId}` : ''
  const initialDraft = useRef(undefined)
  if (initialDraft.current === undefined) {
    try {
      const saved = draftKey ? JSON.parse(localStorage.getItem(draftKey) || 'null') : null
      initialDraft.current = saved?.version === 1 && saved.form && typeof saved.form === 'object' && !Array.isArray(saved.form) ? saved.form : null
    } catch { initialDraft.current = null }
  }
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [selectedClient, setSelectedClient] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [scheduledLookup, setScheduledLookup] = useState({})
  const [areaEditValue, setAreaEditValue] = useState('')
  const [addingArea, setAddingArea] = useState(false)
  const [newArea, setNewArea] = useState('')
  const [areaSaving, setAreaSaving] = useState(false)
  const [areaMessage, setAreaMessage] = useState('')
  const [dogEditor, updateDogEditor] = useState(initialDraft.current)
  const dogEditorRef = useRef(initialDraft.current)
  const [newClientOpen, setNewClientOpen] = useState(Boolean(initialDraft.current))
  const [draftMessage, setDraftMessage] = useState(initialDraft.current ? 'Your unfinished client was restored.' : '')

  // Keep the page behind the New Client sheet completely still on iPhone/WKWebView.
  // Without this, iOS can pan the whole document when the keyboard or a focused field appears.
  useEffect(() => {
    if (!newClientOpen || !dogEditor) return undefined
    const scrollY = window.scrollY || window.pageYOffset || 0
    const body = document.body
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      window.scrollTo(0, scrollY)
    }
  }, [newClientOpen, Boolean(dogEditor)])
  const setDogEditor = value => {
    const next = typeof value === 'function' ? value(dogEditorRef.current) : value
    dogEditorRef.current = next
    // Write during each field change so an app switch need not wait for an effect.
    if (newClientOpen && next && draftKey) {
      try {
        localStorage.setItem(draftKey, JSON.stringify({version:1, form:next}))
        setDraftMessage('Draft saved on this device.')
      } catch { setDraftMessage('Draft could not be saved on this device. Keep this form open until you save the client.') }
    }
    updateDogEditor(next)
  }
  const [dogSaving, setDogSaving] = useState(false)
  const [dogMessage, setDogMessage] = useState('')
  const [rebookTextDate, setRebookTextDate] = useState('')
  const [paymentPreference,setPaymentPreference] = useState('')
  const [paymentPreferenceSaving,setPaymentPreferenceSaving] = useState(false)
  const [paymentPreferenceMessage,setPaymentPreferenceMessage] = useState('')
  const [clientDetails,setClientDetails] = useState(null)
  const [clientDetailsSaving,setClientDetailsSaving] = useState(false)
  const [clientDetailsMessage,setClientDetailsMessage] = useState('')
  const [dogDetailsLookup,setDogDetailsLookup] = useState({})

  const valueOf = (row, ...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
        return row[key]
      }
    }
    return ''
  }

  const textDate = value => {
    if (!value) return ''
    const key = String(value).slice(0,10)
    const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) return String(value)
    const date = new Date(`${key}T12:00:00Z`)
    return date.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})
  }

  const normalizedKey = value => String(value || '').trim().toLowerCase()
  const householdScheduleKey = value => value ? `h:${normalizedKey(value)}` : ''
  const ownerScheduleKey = value => value ? `o:${normalizedKey(value)}` : ''

  const scheduleForClient = client => {
    const byHousehold = householdScheduleKey(client.household)
    const byOwner = ownerScheduleKey(client.owner)
    return (byHousehold && scheduledLookup[byHousehold]) || (byOwner && scheduledLookup[byOwner]) || null
  }

  const scheduledDueInfo = (baseDue, scheduleInfo) => {
    if (!scheduleInfo?.date) return baseDue
    const today = businessDateKey()
    const thisWeek = mondayForDate(today)
    const appointmentWeek = mondayForDate(scheduleInfo.date)
    const firstVisit = !baseDue?.dueDate && baseDue?.status === 'Not enough data'
    const status = firstVisit
      ? (scheduleInfo.date === today ? 'First visit today' : 'First visit scheduled')
      : scheduleInfo.date === today
        ? 'Scheduled today'
        : appointmentWeek === thisWeek
          ? 'Scheduled this week'
          : 'Scheduled'
    return {
      ...baseDue,
      status,
      detail: scheduleInfo.time ? `${textDate(scheduleInfo.date)} · ${scheduleInfo.time}` : textDate(scheduleInfo.date),
      rank:4,
      scheduled:true,
      scheduleDate:scheduleInfo.date,
      scheduleTime:scheduleInfo.time || '',
      scheduleGroomer:scheduleInfo.groomer || ''
    }
  }

  useEffect(() => {
    if (!supabase) {
      setScheduledLookup({})
      return
    }

    let cancelled = false

    const loadScheduledAppointments = async () => {
      try {
        const today = businessDateKey()
        const startWeek = mondayForDate(today)
        const endDate = new Date(`${today}T12:00:00Z`)
        endDate.setUTCDate(endDate.getUTCDate() + 84)
        const endWeek = mondayForDate(endDate.toISOString().slice(0,10))

        const {data,error:scheduleError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json')
          .gte('week_start',startWeek)
          .lte('week_start',endWeek)
          .order('week_start',{ascending:true})

        if (scheduleError) throw scheduleError
        if (cancelled) return

        const lookup = {}
        const remember = (key, info) => {
          if (!key) return
          const current = lookup[key]
          if (!current || `${info.date} ${info.time || ''}` < `${current.date} ${current.time || ''}`) {
            lookup[key] = info
          }
        }

        for (const week of (data || [])) {
          for (const row of (Array.isArray(week.plan_json) ? week.plan_json : [])) {
            if (!row || !String(row.Owner || '').trim()) continue
            const date = String(row.Date || '').slice(0,10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue

            const appointmentStatus = String(row['Appointment Status'] || '').trim().toLowerCase()
            const completionStatus = String(row['Completion Status'] || '').trim().toLowerCase()
            if (['cancelled','canceled','moved to another week'].includes(appointmentStatus)) continue
            if (completionStatus === 'completed') continue

            const info = {
              date,
              time:String(row['Start Time'] || row['Locked Time'] || '').trim(),
              groomer:String(row.Groomer || '').trim(),
              dogs:String(row.Dogs || '').trim()
            }
            remember(householdScheduleKey(row['Household ID']), info)
            remember(ownerScheduleKey(row.Owner), info)
          }
        }

        setScheduledLookup(lookup)
      } catch (err) {
        if (!cancelled) {
          console.error('Could not load scheduled client status', err)
          setScheduledLookup({})
        }
      }
    }

    loadScheduledAppointments()
    return () => { cancelled = true }
  }, [revision])

  const grouped = useMemo(()=>Object.values(
    (dogs || []).reduce((acc, row) => {
      const owner = valueOf(row, 'owner', 'Owner') || 'Unknown owner'
      const dog = valueOf(row, 'dog', 'Dog') || 'Unnamed dog'
      const household = valueOf(row, 'household_id', 'Household ID') || owner
      const key = String(household || owner)

      if (!acc[key]) {
        acc[key] = {
          household,
          owner,
          dogs: [],
          area: canonicalAreaLabel(valueOf(row, 'area', 'Area')),
          groomer: valueOf(row, 'groomer', 'Groomer'),
          phone: valueOf(row, 'phone', 'Phone'),
          address: valueOf(row, 'address', 'Address'),
          city: valueOf(row, 'city', 'City'),
          state: valueOf(row, 'state', 'State'),
          zip: valueOf(row, 'zip', 'ZIP'),
          notes: valueOf(row, 'notes', 'Notes'),
          rows: []
        }
      }

      if (dog && !acc[key].dogs.includes(dog)) {
        acc[key].dogs.push(dog)
      }

      acc[key].rows.push(row)
      return acc
    }, {})
  ).sort((a, b) => a.owner.localeCompare(b.owner)),[dogs])

  const preparedClients = useMemo(()=>grouped.map(client => {
    const baseDue = clientDueInfo(client.rows)
    const scheduleInfo = scheduleForClient(client)
    return {...client, scheduleInfo, dueInfo:scheduledDueInfo(baseDue,scheduleInfo)}
  }),[grouped,scheduledLookup])

  const needsSchedulingClients = useMemo(()=>preparedClients.filter(client =>
    !client.dueInfo.scheduled && ['Overdue','Due today','Due this week','Due soon'].includes(client.dueInfo.status)
  ),[preparedClients])

  const areaOptions = useMemo(()=>[...new Set(
    preparedClients
      .map(client => canonicalAreaLabel(client.area))
      .filter(Boolean)
  )].sort((a,b) => a.localeCompare(b)),[preparedClients])

  const filtered = useMemo(()=>preparedClients
    .filter(client => {
      const haystack = `${client.owner} ${client.dogs.join(' ')} ${client.area} ${client.groomer}`.toLowerCase()
      const matchesSearch = haystack.includes(query.trim().toLowerCase())
      const needsScheduling = !client.dueInfo.scheduled && ['Overdue','Due today','Due this week','Due soon'].includes(client.dueInfo.status)
      const matchesArea = areaFilter === 'all' || normalizedKey(client.area) === normalizedKey(areaFilter)
      return matchesSearch && (clientFilter === 'all' || (needsScheduling && matchesArea))
    })
    .sort((a,b) => String(a.owner || '').trim().localeCompare(String(b.owner || '').trim(), 'en', {sensitivity:'base', numeric:true})),
    [preparedClients,query,clientFilter,areaFilter]
  )

  useEffect(() => {
    if (!openClient) return
    const wantedHousehold = normalizedKey(openClient.household)
    const wantedOwner = normalizedKey(openClient.owner)
    const found = preparedClients.find(client =>
      (wantedHousehold && normalizedKey(client.household) === wantedHousehold) ||
      (wantedOwner && normalizedKey(client.owner) === wantedOwner)
    )
    if (!found) return
    setSelectedClient(found)
    onOpenClientHandled?.()
  }, [openClient?.key, openClient?.household, openClient?.owner, dogs, scheduledLookup])

  useEffect(() => {
    if (!selectedClient) {
      setAreaEditValue('')
      setAddingArea(false)
      setNewArea('')
      setAreaMessage('')
      setPaymentPreference('')
      setPaymentPreferenceMessage('')
      setClientDetails(null)
      setClientDetailsMessage('')
      setDogDetailsLookup({})
      return
    }
    setAreaEditValue(canonicalAreaLabel(selectedClient.area))
    setAddingArea(false)
    setNewArea('')
    setAreaMessage('')
    setRebookTextDate('')
    setPaymentPreference('')
    setPaymentPreferenceMessage('')
  }, [selectedClient?.household, selectedClient?.owner])

  useEffect(() => {
    if (!selectedClient || !supabase) return
    let cancelled = false
    const loadPaymentPreference = async () => {
      const key = paymentPreferenceKey(selectedClient.household,selectedClient.owner)
      if (!key) return
      const {data,error:preferenceError} = await supabase
        .from('client_payment_preferences')
        .select('payment_method')
        .eq('owner_key',key)
        .maybeSingle()
      if (cancelled) return
      if (preferenceError) {
        setPaymentPreferenceMessage(preferenceError.message || 'Could not load preferred payment.')
        return
      }
      setPaymentPreference(String(data?.payment_method || '').trim())
    }
    loadPaymentPreference()
    return () => { cancelled = true }
  }, [selectedClient?.household, selectedClient?.owner])

  useEffect(() => {
    if (!selectedClient || !supabase) return
    let cancelled = false
    const loadExtraDetails = async () => {
      const householdId = String(selectedClient.household || '').trim()
      if (!householdId) return
      const [{data:clientRow,error:clientError},{data:dogRows,error:dogError}] = await Promise.all([
        supabase.from('client_details').select('*').eq('household_id',householdId).maybeSingle(),
        supabase.from('dog_details').select('*').eq('household_id',householdId)
      ])
      if (cancelled) return
      if (clientError) setClientDetailsMessage(clientError.message || 'Could not load client details.')
      const base = clientRow || {}
      setClientDetails({
        gate_access_notes:base.gate_access_notes || '', parking_notes:base.parking_notes || '', client_notes:base.client_notes || '',
        preferred_appointment_window:base.preferred_appointment_window || '', preferred_time:base.preferred_time || '',
        contact_preference:base.contact_preference || 'Text', alternate_contact_name:base.alternate_contact_name || '', alternate_contact_phone:base.alternate_contact_phone || '',
        fixed_time:Boolean(base.fixed_time), receipt_preference:base.receipt_preference || '', client_status:base.client_status || 'Active'
      })
      if (!dogError) setDogDetailsLookup(Object.fromEntries((dogRows || []).map(row => [normalizedKey(row.dog_name),row])))
    }
    loadExtraDetails()
    return () => { cancelled = true }
  }, [selectedClient?.household, selectedClient?.owner, revision])

  const saveClientDetails = async () => {
    if (!selectedClient || !clientDetails || !supabase || clientDetailsSaving) return
    dismissFormKeyboard()
    setClientDetailsSaving(true); setClientDetailsMessage('')
    try {
      const {error} = await supabase.from('client_details').upsert({
        household_id:String(selectedClient.household || '').trim(), owner_name:String(selectedClient.owner || '').trim(), ...clientDetails, updated_at:new Date().toISOString()
      },{onConflict:'household_id'})
      if (error) throw error
      setClientDetailsMessage('Client details saved.')
    } catch(err) { setClientDetailsMessage(err?.message || 'Could not save client details.') }
    finally { setClientDetailsSaving(false) }
  }

  const savePaymentPreference = async () => {
    if (!selectedClient || !supabase || paymentPreferenceSaving) return
    dismissFormKeyboard()
    const key = paymentPreferenceKey(selectedClient.household,selectedClient.owner)
    if (!key) {
      setPaymentPreferenceMessage('Could not identify this client.')
      return
    }
    setPaymentPreferenceSaving(true)
    setPaymentPreferenceMessage('')
    try {
      const {error:saveError} = await supabase
        .from('client_payment_preferences')
        .upsert({
          owner_key:key,
          owner_name:String(selectedClient.owner || '').trim(),
          payment_method:paymentPreference || null,
          updated_at:new Date().toISOString()
        },{onConflict:'owner_key'})
      if (saveError) throw saveError
      setPaymentPreferenceMessage(paymentPreference ? `${paymentPreference} saved as preferred payment.` : 'Preferred payment cleared.')
    } catch (err) {
      setPaymentPreferenceMessage(err?.message || 'Could not save preferred payment.')
    } finally {
      setPaymentPreferenceSaving(false)
    }
  }

  const saveClientArea = async rawArea => {
    if (!selectedClient || !supabase || areaSaving) return
    const area = canonicalAreaLabel(rawArea)
    if (!area) {
      setAreaMessage('Enter an area name first.')
      return
    }

    setAreaSaving(true)
    setAreaMessage('')
    try {
      const {data,error:saveError} = await supabase.rpc('update_client_area', {
        p_household_id:String(selectedClient.household || '').trim() || null,
        p_owner:String(selectedClient.owner || '').trim(),
        p_area:area
      })
      if (saveError) {
        if (saveError.code === 'PGRST202' || saveError.code === '42883') {
          throw new Error('Area editing needs its one-time Supabase setup first.')
        }
        throw saveError
      }
      if (data?.status && data.status !== 'updated') throw new Error('The area change could not be confirmed.')

      setSelectedClient(current => current ? {
        ...current,
        area,
        rows:(current.rows || []).map(row => ({...row, area, Area:area}))
      } : current)
      setAreaEditValue(area)
      setAddingArea(false)
      setNewArea('')
      setAreaMessage(`Area saved as ${area}.`)
      onDataChanged?.(`Area updated to ${area}.`)
    } catch (err) {
      setAreaMessage(err?.message || 'Could not save the area.')
    } finally {
      setAreaSaving(false)
    }
  }

  const commonFrequencyOptions = ['2','4','6','8','10','12']
  const blankAdditionalDog = () => ({
    dog:'', service:'Groom', groom_price:'', bath_price:'', partial_groom_price:'',
    groom_minutes:'', bath_minutes:'', partial_groom_minutes:'', frequency_weeks:'', frequency_mode:'preset',
    last_groom:'', last_bath:'', prior_service:'no', first_appointment_service:'Groom', grooming_notes:'', behavior_notes:'', medical_notes:'', alternate_service:false, alternate_service_1:'Groom', alternate_service_2:'Bath Only'
  })
  const blankDogForm = (client = null) => ({
    household_id:client?.household || '', owner:client?.owner || '', original_dog:'', dog:'',
    phone:client?.phone || '', groomer:client?.groomer || '', area:client?.area || '', area_mode:'existing', new_area:'',
    address:client?.address || '', city:client?.city || '', state:client?.state || 'TX', zip:client?.zip || '',
    service:'Groom', groom_price:'', bath_price:'', partial_groom_price:'', groom_minutes:'', bath_minutes:'', partial_groom_minutes:'', frequency_weeks:'', frequency_mode:'preset', last_groom:'', last_bath:'',
    prior_service:'no', first_appointment_booked:false, first_appointment_date:'', first_appointment_groomer:'Jen', first_appointment_time:'09:00', first_appointment_service:'Groom', first_appointment_fixed:false, first_appointment_override:false,
    preferred_payment:'', additional_dogs:[], gate_access_notes:'', parking_notes:'', client_notes:'', preferred_appointment_window:'', preferred_time:'', contact_preference:'Text', alternate_contact_name:'', alternate_contact_phone:'', fixed_time:false, receipt_preference:'', client_status:'Active', grooming_notes:'', behavior_notes:'', medical_notes:'', alternate_service:false, alternate_service_1:'Groom', alternate_service_2:'Bath Only'
  })

  const openNewClient = () => {
    let draft = null
    try {
      const saved = draftKey ? JSON.parse(localStorage.getItem(draftKey) || 'null') : null
      if (saved?.version === 1 && saved.form && typeof saved.form === 'object' && !Array.isArray(saved.form)) draft = saved.form
    } catch {}
    const form = {...blankDogForm(), ...(draft || {})}
    dogEditorRef.current = form
    updateDogEditor(form)
    setDogMessage('')
    setDraftMessage(draft ? 'Your unfinished client was restored.' : '')
    setNewClientOpen(true)
  }

  const clearNewClientDraft = () => {
    if (dogSaving) return
    try { if (draftKey) localStorage.removeItem(draftKey) }
    catch { setDraftMessage('Could not clear the saved draft.'); return }
    const form = blankDogForm()
    dogEditorRef.current = form
    updateDogEditor(form)
    setDogMessage('')
    setDraftMessage('Draft cleared. Ready for a new client.')
  }

  const editDog = row => {
    const client = selectedClient
    setDogEditor({
    household_id:selectedClient.household || '', owner:selectedClient.owner || '',
    original_dog:valueOf(row,'dog','Dog') || '', dog:valueOf(row,'dog','Dog') || '',
    phone:selectedClient.phone || '', groomer:valueOf(row,'groomer','Groomer') || selectedClient.groomer || '',
    area:selectedClient.area || '', area_mode:'existing', new_area:'', address:selectedClient.address || '', city:selectedClient.city || '',
    state:selectedClient.state || 'TX', zip:selectedClient.zip || '',
    service:canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern')) || 'Groom',
    groom_price:valueOf(row,'groom_price','Groom Price') || (['Groom','Service Varies'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'price','Price') : ''),
    bath_price:valueOf(row,'bath_price','Bath Price') || (['Bath','Bath Only'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'price','Price') : ''),
    partial_groom_price:valueOf(row,'partial_groom_price','Partial Groom Price') || (canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))==='Partial Groom' ? valueOf(row,'price','Price') : ''),
    groom_minutes:valueOf(row,'groom_minutes','Groom Minutes') || (['Groom','Service Varies'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'minutes','Minutes') : ''),
    bath_minutes:valueOf(row,'bath_minutes','Bath Minutes') || (['Bath','Bath Only'].includes(canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))) ? valueOf(row,'minutes','Minutes') : ''),
    partial_groom_minutes:valueOf(row,'partial_groom_minutes','Partial Groom Minutes') || (canonicalServiceLabel(valueOf(row,'service_pattern','Service Pattern'))==='Partial Groom' ? valueOf(row,'minutes','Minutes') : ''),
    frequency_weeks:valueOf(row,'frequency_weeks','Frequency Weeks'),
    frequency_mode:commonFrequencyOptions.includes(String(valueOf(row,'frequency_weeks','Frequency Weeks') || '')) ? 'preset' : (valueOf(row,'frequency_weeks','Frequency Weeks') ? 'custom' : 'preset'),
    last_groom:String(valueOf(row,'last_groom','Last Groom','last_groom_date','Last Groom Date') || '').slice(0,10),
    last_bath:String(valueOf(row,'last_bath','Last Bath','last_bath_date','Last Bath Date') || '').slice(0,10),
    prior_service:(valueOf(row,'last_groom','Last Groom','last_groom_date','Last Groom Date') || valueOf(row,'last_bath','Last Bath','last_bath_date','Last Bath Date')) ? 'yes' : 'no',
    first_appointment_booked:false, first_appointment_date:'', first_appointment_groomer:'Jen', first_appointment_time:'09:00', first_appointment_service:'Groom', first_appointment_fixed:false, first_appointment_override:false, additional_dogs:[],
    grooming_notes:dogDetailsLookup[normalizedKey(valueOf(row,'dog','Dog'))]?.grooming_notes || '',
    behavior_notes:dogDetailsLookup[normalizedKey(valueOf(row,'dog','Dog'))]?.behavior_notes || '',
    medical_notes:dogDetailsLookup[normalizedKey(valueOf(row,'dog','Dog'))]?.medical_notes || '',
    alternate_service:Boolean(dogDetailsLookup[normalizedKey(valueOf(row,'dog','Dog'))]?.alternate_service),
    alternate_service_1:dogDetailsLookup[normalizedKey(valueOf(row,'dog','Dog'))]?.alternate_service_1 || 'Groom',
    alternate_service_2:dogDetailsLookup[normalizedKey(valueOf(row,'dog','Dog'))]?.alternate_service_2 || 'Bath Only'
    })
    setSelectedClient(null)
  }

  const saveDogForm = async (form, closeNew=false) => {
    if (!supabase || dogSaving) return

    const extraDogs = closeNew && Array.isArray(form.additional_dogs) ? form.additional_dogs : []
    const dogsToSave = closeNew
      ? [
          {...form, additional_dogs:undefined},
          ...extraDogs.map(dog => ({
            ...form,
            ...dog,
            original_dog:'',
            additional_dogs:undefined,
            first_appointment_booked:false,
            first_appointment_date:'',
            first_appointment_groomer:form.first_appointment_groomer,
            first_appointment_time:form.first_appointment_time,
            first_appointment_fixed:form.first_appointment_fixed
          }))
        ]
      : [form]

    if (!String(form.owner||'').trim()) { setDogMessage('Owner name is required.'); return }
    if (dogsToSave.some(dog => !String(dog.dog||'').trim())) { setDogMessage('Enter a name for every dog.'); return }
    const dogNames = dogsToSave.map(dog => normalizedKey(dog.dog))
    if (new Set(dogNames).size !== dogNames.length) { setDogMessage('Each dog needs a different name.'); return }

    const bookingFirstVisit = Boolean(closeNew && form.prior_service === 'no' && form.first_appointment_booked)
    if (bookingFirstVisit) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.first_appointment_date || ''))) { setDogMessage('Choose the first appointment date.'); return }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(form.first_appointment_time || ''))) { setDogMessage('Choose a valid first appointment time.'); return }
      if (!['Jen','Haley'].includes(form.first_appointment_groomer)) { setDogMessage('Choose Jen or Haley for the first appointment.'); return }
      if (dogsToSave.some(dog => !appointmentServiceOptions.includes(dog.first_appointment_service || dog.service))) { setDogMessage('Choose a first appointment service for every dog.'); return }
      const weekday = new Date(`${form.first_appointment_date}T12:00:00Z`).getUTCDay()
      if (![1,2,3,4,5].includes(weekday)) { setDogMessage('First appointments must be Monday through Friday.'); return }
      const firstVisitOverrideReasons = schedulingOverrideReasons(form.first_appointment_date,form.first_appointment_groomer,['Jen','Haley'].includes(form.groomer)?[form.groomer]:[])
      if (firstVisitOverrideReasons.length && !form.first_appointment_override) { setDogMessage('Turn on Manual override to book this first visit outside the normal groomer rules.'); return }
    }

    dismissFormKeyboard()
    setDogSaving(true); setDogMessage('')
    let savedCount = 0
    try {
      const num = v => String(v ?? '').trim()==='' ? null : Number(v)
      let householdId = String(form.household_id||'').trim() || null

      for (const dogForm of dogsToSave) {
        const cleanLastGroom = closeNew && dogForm.prior_service === 'no' ? null : (dogForm.last_groom || null)
        const cleanLastBath = closeNew && dogForm.prior_service === 'no' ? null : (dogForm.last_bath || null)
        const {data,error:saveError} = await supabase.rpc('save_grooming_dog', {
          p_household_id:householdId,
          p_owner:String(form.owner||'').trim(), p_original_dog:String(dogForm.original_dog||'').trim() || null,
          p_dog:String(dogForm.dog||'').trim(), p_phone:String(form.phone||'').trim() || null,
          p_groomer:String(form.groomer||'').trim() || null, p_area:canonicalAreaLabel(form.area_mode==='new' ? form.new_area : form.area) || null,
          p_address:String(form.address||'').trim() || null, p_city:String(form.city||'').trim() || null,
          p_state:String(form.state||'').trim() || null, p_zip:String(form.zip||'').trim() || null,
          p_service:dogForm.service || 'Groom', p_price:num(dogForm.groom_price || dogForm.bath_price || dogForm.partial_groom_price),
          p_groom_price:num(dogForm.groom_price), p_bath_price:num(dogForm.bath_price), p_partial_groom_price:num(dogForm.partial_groom_price),
          p_groom_minutes:num(dogForm.groom_minutes), p_bath_minutes:num(dogForm.bath_minutes), p_partial_groom_minutes:num(dogForm.partial_groom_minutes),
          p_minutes:num(dogForm.groom_minutes || dogForm.bath_minutes || dogForm.partial_groom_minutes),
          p_frequency_weeks:num(dogForm.frequency_weeks), p_last_groom:cleanLastGroom, p_last_bath:cleanLastBath
        })
        if (saveError) throw saveError
        savedCount += 1
        const savedRow = Array.isArray(data) ? data[0] : data
        householdId = String(savedRow?.household_id || savedRow?.householdId || householdId || '').trim() || null
      }

      if (closeNew && form.preferred_payment) {
        const {error:preferenceError} = await supabase.from('client_payment_preferences').upsert({
          owner_key:paymentPreferenceKey(householdId,form.owner),
          owner_name:String(form.owner || '').trim(), payment_method:form.preferred_payment,
          updated_at:new Date().toISOString()
        },{onConflict:'owner_key'})
        if (preferenceError) throw preferenceError
      }

      // Save the household/client extras after we know the final household id.
      if (householdId && closeNew) {
        const {error:clientDetailsError} = await supabase.from('client_details').upsert({
          household_id:householdId, owner_name:String(form.owner||'').trim(),
          gate_access_notes:String(form.gate_access_notes||'').trim() || null,
          parking_notes:String(form.parking_notes||'').trim() || null,
          client_notes:String(form.client_notes||'').trim() || null,
          preferred_appointment_window:String(form.preferred_appointment_window||'').trim() || null,
          preferred_time:String(form.preferred_time||'').trim() || null,
          contact_preference:String(form.contact_preference||'').trim() || null,
          alternate_contact_name:String(form.alternate_contact_name||'').trim() || null,
          alternate_contact_phone:String(form.alternate_contact_phone||'').trim() || null,
          fixed_time:Boolean(form.fixed_time), receipt_preference:String(form.receipt_preference||'').trim() || null,
          client_status:String(form.client_status||'Active').trim() || 'Active', updated_at:new Date().toISOString()
        },{onConflict:'household_id'})
        if (clientDetailsError) throw clientDetailsError
      }
      if (householdId) {
        for (const dogForm of dogsToSave) {
          const {error:dogDetailsError} = await supabase.from('dog_details').upsert({
            household_id:householdId, dog_name:String(dogForm.dog||'').trim(),
            grooming_notes:String(dogForm.grooming_notes||'').trim() || null,
            behavior_notes:String(dogForm.behavior_notes||'').trim() || null,
            medical_notes:String(dogForm.medical_notes||'').trim() || null,
            alternate_service:Boolean(dogForm.alternate_service),
            alternate_service_1:dogForm.alternate_service ? (dogForm.alternate_service_1 || 'Groom') : null,
            alternate_service_2:dogForm.alternate_service ? (dogForm.alternate_service_2 || 'Bath Only') : null,
            updated_at:new Date().toISOString()
          },{onConflict:'household_id,dog_name'})
          if (dogDetailsError) throw dogDetailsError
        }
      }

      if (bookingFirstVisit) {
        const appointmentDogs = dogsToSave.map(dog => {
          const service = dog.first_appointment_service || dog.service || 'Groom'
          return {...dog, firstService:service, defaults:serviceDefaultsForDog(dog,service)}
        })
        const totalPrice = appointmentDogs.reduce((sum,dog)=>sum + Number(dog.defaults.price || 0),0)
        const totalMinutes = appointmentDogs.reduce((sum,dog)=>sum + Number(dog.defaults.minutes || 0),0)
        const area = canonicalAreaLabel(form.area_mode==='new' ? form.new_area : form.area)
        const {data:appointmentData,error:appointmentError} = await supabase.rpc('add_grooming_appointment',{
          p_date:form.first_appointment_date,
          p_household_id:householdId,
          p_owner:String(form.owner||'').trim(),
          p_dogs:appointmentDogs.map(dog=>`${String(dog.dog||'').trim()} (${dog.firstService})`).join(', '),
          p_groomer:form.first_appointment_groomer,
          p_start_time:form.first_appointment_time,
          p_fixed:Boolean(form.first_appointment_fixed),
          p_price:totalPrice,
          p_minutes:Math.max(1,Math.round(totalMinutes || 1)),
          p_area:area || null,
          p_note:'First visit'
        })
        if (appointmentError) {
          if (appointmentError.code === 'PGRST202' || appointmentError.code === '42883') throw new Error('Client saved, but Add Appointment needs its one-time Supabase setup first.')
          throw new Error(`Client saved, but the first appointment could not be added: ${appointmentError.message || 'Unknown error'}`)
        }
        if (appointmentData?.status !== 'added') throw new Error('Client saved, but the first appointment could not be confirmed.')
      }

      if (closeNew && draftKey) {
        try { localStorage.removeItem(draftKey) } catch {}
      }
      setDogEditor(null); if (closeNew) setNewClientOpen(false)
      onDataChanged?.(bookingFirstVisit
        ? `${form.owner} · ${dogsToSave.length} dog${dogsToSave.length===1?'':'s'} saved · first visit ${textDate(form.first_appointment_date)} at ${displayClockTime(form.first_appointment_time)}.`
        : closeNew && dogsToSave.length > 1 ? `${form.owner} · ${dogsToSave.length} dogs saved.` : `${form.dog} saved.`)
      if (selectedClient) setSelectedClient(null)
    } catch(err) {
      setDogMessage(err?.message || (savedCount ? `${savedCount} dog${savedCount===1?'':'s'} saved, but the rest could not be completed.` : 'Could not save dog.'))
    }
    finally { setDogSaving(false) }
  }

  const updateAdditionalDog = (index, patch) => {
    setDogEditor(current => current ? {
      ...current,
      additional_dogs:(current.additional_dogs || []).map((dog,i) => i === index ? {...dog,...patch} : dog)
    } : current)
  }

  const removeAdditionalDog = index => {
    setDogEditor(current => current ? {
      ...current,
      additional_dogs:(current.additional_dogs || []).filter((_,i) => i !== index)
    } : current)
  }

  useEffect(() => {
    if (!selectedClient || !supabase) {
      setHistory([])
      setHistoryError('')
      return
    }

    let cancelled = false

    const loadHistory = async () => {
      setHistoryLoading(true)
      setHistoryError('')

      try {
        const {data,error:historyLoadError} = await supabase
          .from('weekly_drafts')
          .select('week_start,plan_json,status')
          .order('week_start',{ascending:false})
          .limit(104)

        if (historyLoadError) throw historyLoadError
        if (cancelled) return

        const targetHousehold = String(selectedClient.household || '').trim().toLowerCase()
        const targetOwner = String(selectedClient.owner || '').trim().toLowerCase()
        const today = businessDateKey()

        const rows = (data || []).flatMap(week =>
          (Array.isArray(week.plan_json) ? week.plan_json : []).map((row,index) => ({
            row,
            weekStart:String(week.week_start || '').slice(0,10),
            weekStatus:week.status,
            index
          }))
        )

        const matches = rows
          .filter(item => {
            const rowHousehold = String(item.row?.['Household ID'] || '').trim().toLowerCase()
            const rowOwner = String(item.row?.Owner || '').trim().toLowerCase()
            return (targetHousehold && rowHousehold && rowHousehold === targetHousehold) ||
              (!rowHousehold && rowOwner === targetOwner) ||
              (!targetHousehold && rowOwner === targetOwner)
          })
          .map(item => {
            const row = item.row || {}
            const completion = String(row['Completion Status'] || '').trim().toLowerCase()
            const appointmentStatus = String(row['Appointment Status'] || '').trim().toLowerCase()
            const date = String(row.Date || '').slice(0,10)
            const completedDate = String(row['Completed Date'] || '').slice(0,10)
            const rescheduledTo = String(row['Rescheduled To'] || '').slice(0,10)
            const cancelledDate = String(row['Cancelled Date'] || '').slice(0,10)

            const rawStatus = String(row.Status || '').trim()
            const rawStatusLower = rawStatus.toLowerCase()
            const statusNote = String(row['Status Note'] || '').trim()
            const explicitlyMissed = ['missed','no show','no-show','noshow'].some(value =>
              rawStatusLower === value || rawStatusLower.includes(value)
            )

            let status = 'Scheduled'
            let statusClass = 'confirmed'
            if (completion === 'completed') {
              status = 'Completed'
              statusClass = 'confirmed'
            } else if (['cancelled','canceled'].includes(appointmentStatus)) {
              status = 'Cancelled'
              statusClass = 'pending'
            } else if (appointmentStatus === 'moved to another week') {
              status = 'Rescheduled'
              statusClass = 'pending'
            } else if (date && date < today && explicitlyMissed) {
              status = 'No-show'
              statusClass = 'pending'
            } else if (date && date < today) {
              status = 'Needs review'
              statusClass = 'locked'
            }

            const priceText = String(row.Price ?? '').replace(/[$,]/g,'').trim()
            const price = priceText === '' ? NaN : Number(priceText)
            const sortDate = completedDate || cancelledDate || rescheduledTo || date || item.weekStart
            const operationalStatusText = `${rawStatusLower} ${statusNote.toLowerCase()}`
            const suppressOperationalStatus = ['overdue','due soon','due'].some(value =>
              operationalStatusText.includes(value)
            )
            const note = suppressOperationalStatus ? '' : (statusNote || rawStatus)

            return {
              id:`${item.weekStart}-${row['Household ID'] || row.Owner}-${item.index}`,
              weekStart:item.weekStart,
              sourceRow:row,
              date,
              sortDate,
              completedDate,
              cancelledDate,
              rescheduledTo,
              status,
              statusClass,
              groomer:String(row.Groomer || '').trim(),
              dogs:String(row.Dogs || '').trim(),
              time:String(row['Start Time'] || row['Locked Time'] || '').trim(),
              price,
              note
            }
          })
          .filter(item => item.status !== 'Scheduled')
          .sort((a,b) => String(b.sortDate).localeCompare(String(a.sortDate)))

        setHistory(matches)
      } catch (err) {
        if (!cancelled) {
          setHistory([])
          setHistoryError(err.message || 'Could not load appointment history.')
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }

    loadHistory()
    return () => { cancelled = true }
  }, [selectedClient, revision])

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Live Supabase data</div>
          <h1>Clients</h1>
        </div>
        {!viewerMode && <button className="primary-mini" onClick={openNewClient}><Plus size={16}/>New</button>}
      </div>

      <div className="search">
        <Search size={17}/>
        <input
          placeholder="Search owner or dog"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>

      <div style={{display:'flex',gap:8,marginTop:12,marginBottom:4}}>
        <button
          type="button"
          className={clientFilter === 'all' ? 'primary-mini' : 'secondary-btn'}
          onClick={() => {
            setClientFilter('all')
            setAreaFilter('all')
          }}
          style={{flex:1,justifyContent:'center'}}
        >
          All Clients
        </button>
        <button
          type="button"
          className={clientFilter === 'needs' ? 'primary-mini' : 'secondary-btn'}
          onClick={() => setClientFilter('needs')}
          style={{flex:1,justifyContent:'center'}}
        >
          Needs Scheduling{needsSchedulingClients.length ? ` (${needsSchedulingClients.length})` : ''}
        </button>
      </div>

      {clientFilter === 'needs' && (
        <div style={{marginTop:10}}>
          <label style={{display:'block',fontSize:13,fontWeight:700,color:'#737b89',marginBottom:6}}>
            Area
          </label>
          <select
            value={areaFilter}
            onChange={event => setAreaFilter(event.target.value)}
            style={{
              width:'100%',
              padding:'13px 14px',
              border:'1px solid #deddd8',
              borderRadius:14,
              background:'#fff',
              color:'#172038',
              fontSize:16,
              fontWeight:600
            }}
          >
            <option value="all">All areas</option>
            {areaOptions.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </div>
      )}

      <div className="prototype-note" style={{marginTop:10}}>
        {clientFilter === 'needs'
          ? 'Showing due or overdue clients who do not already have an active appointment booked.'
          : 'Clients are listed A–Z by owner name. Already-booked clients show Scheduled instead of Overdue.'}
      </div>

      {loading && <div className="prototype-note">Loading your clients…</div>}
      {error && <div className="login-message">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="prototype-note">{clientFilter === 'needs' ? (areaFilter !== 'all' ? `No clients in ${areaFilter} currently need scheduling.` : 'No clients currently need scheduling.') : 'No matching clients found.'}</div>
      )}

      <div className="client-list">
        {filtered.map((client, index) => {
          const status = client.dueInfo.status
          const statusStyle = client.dueInfo.scheduled
            ? {background:'#eef5fb',border:'#c9dced',color:'#31577a'}
            : status === 'Overdue'
              ? {background:'#fff0ef',border:'#e8b5b0',color:'#9b3832'}
              : ['Due today','Due this week'].includes(status)
                ? {background:'#fff7e8',border:'#ead39d',color:'#7a5719'}
                : status === 'Due soon'
                  ? {background:'#f3f1ed',border:'#ddd8cf',color:'#59616e'}
                  : {background:'#f7f7f5',border:'#e5e2dc',color:'#737b89'}
          return (
            <button
              key={`${client.owner}-${index}`}
              onClick={() => setSelectedClient(client)}
              style={{alignItems:'flex-start'}}
            >
              <div className="avatar"><Dog size={18}/></div>
              <span style={{minWidth:0,flex:1,textAlign:'left'}}>
                <strong style={{display:'block',fontSize:15,color:'#172038',lineHeight:1.25}}>{client.owner}</strong>
                <small style={{display:'block',fontSize:12,fontWeight:650,color:'#59616e',marginTop:3,lineHeight:1.35}}>
                  {client.dogs.join(' + ')}
                </small>
                {(client.area || client.groomer) && (
                  <small style={{display:'block',fontWeight:500,color:'#8a919d',marginTop:4}}>
                    {[client.area, client.groomer].filter(Boolean).join(' · ')}
                  </small>
                )}
                <small style={{display:'inline-flex',alignItems:'center',marginTop:7,padding:'4px 7px',borderRadius:999,border:`1px solid ${statusStyle.border}`,background:statusStyle.background,color:statusStyle.color,fontWeight:800,fontSize:10.5,lineHeight:1.2}}>
                  {client.dueInfo.scheduled
                    ? `${status} · ${textDate(client.dueInfo.scheduleDate)}${client.dueInfo.scheduleTime ? ` · ${displayClockTime(client.dueInfo.scheduleTime)}` : ''}`
                    : `${status}${client.dueInfo.dueDate ? ` · ${textDate(client.dueInfo.dueDate)}` : ''}`}
                </small>
              </span>
              <ChevronRight size={17} style={{marginTop:4}}/>
            </button>
          )
        })}
      </div>

      {dogEditor && (
        <div className={`sheet-backdrop ${newClientOpen ? 'new-client-backdrop' : ''}`} onMouseDown={() => { setDogEditor(null); if(newClientOpen) setNewClientOpen(false) }}>
          <div className={`sheet ${newClientOpen ? 'new-client-sheet' : ''}`} onMouseDown={e=>e.stopPropagation()} style={newClientOpen ? undefined : {maxHeight:'90dvh',overflowY:'auto'}}>
            <div className="sheet-handle" />
            <div className="sheet-title"><div><span>{dogEditor.original_dog ? 'Edit dog' : newClientOpen ? 'New client' : 'Add dog'}</span><h2>{dogEditor.original_dog || dogEditor.dog || 'Dog details'}</h2></div><button className="icon-btn" onClick={()=>{setDogEditor(null);setNewClientOpen(false)}}><X size={18}/></button></div>
            <div className="form-grid dog-entry-form">
              <label>Owner<input value={dogEditor.owner} onChange={e=>setDogEditor({...dogEditor,owner:e.target.value})}/></label>
              <label>Dog name<input value={dogEditor.dog} onChange={e=>setDogEditor({...dogEditor,dog:e.target.value})}/></label>
              <label>Phone<input value={dogEditor.phone} onChange={e=>setDogEditor({...dogEditor,phone:e.target.value})}/></label>
              <label>Groomer<select value={dogEditor.groomer} onChange={e=>{
                const next=e.target.value
                const patch={...dogEditor,groomer:next}
                if(newClientOpen && ['Jen','Haley'].includes(next)) {
                  const previousDefault=defaultFirstStopTime(dogEditor.first_appointment_groomer)
                  patch.first_appointment_groomer=next
                  if(!dogEditor.first_appointment_time || dogEditor.first_appointment_time===previousDefault) patch.first_appointment_time=defaultFirstStopTime(next)
                }
                setDogEditor(patch)
              }}>
                <option value="">Choose groomer</option><option>Either</option><option>Jen</option><option>Haley</option>
              </select></label>
              <label style={{gridColumn:'1 / -1'}}>Area<select value={dogEditor.area_mode==='new'?'__new__':dogEditor.area} onChange={e=>{
                const value=e.target.value
                if(value==='__new__') setDogEditor({...dogEditor,area_mode:'new',area:'',new_area:''})
                else setDogEditor({...dogEditor,area_mode:'existing',area:value,new_area:''})
              }}>
                <option value="">Choose area</option>
                {areaOptions.map(area=><option key={area} value={area}>{area}</option>)}
                {dogEditor.area && !areaOptions.includes(canonicalAreaLabel(dogEditor.area)) && <option value={dogEditor.area}>{dogEditor.area}</option>}
                <option value="__new__">+ Add new area</option>
              </select></label>
              {dogEditor.area_mode==='new' && <label style={{gridColumn:'1 / -1'}}>New area name<input value={dogEditor.new_area || ''} placeholder="Example: Tomball" onChange={e=>setDogEditor({...dogEditor,new_area:e.target.value})}/></label>}
              <label style={{gridColumn:'1 / -1'}}>Address<input value={dogEditor.address} onChange={e=>setDogEditor({...dogEditor,address:e.target.value})}/></label>
              <label>City<input value={dogEditor.city} onChange={e=>setDogEditor({...dogEditor,city:e.target.value})}/></label>
              <label>ZIP<input value={dogEditor.zip} onChange={e=>setDogEditor({...dogEditor,zip:e.target.value})}/></label>
              {newClientOpen && <>
                <div className="eyebrow" style={{gridColumn:'1 / -1',marginTop:8}}>Client preferences</div>
                <label style={{gridColumn:'1 / -1'}}>Preferred payment<select value={dogEditor.preferred_payment || ''} onChange={e=>setDogEditor({...dogEditor,preferred_payment:e.target.value})}><option value="">No preference</option>{PAYMENT_METHOD_OPTIONS.filter(method=>method!=='Cash/Check').map(method=><option key={method} value={method}>{method}</option>)}</select></label>
                <label style={{gridColumn:'1 / -1'}}>Gate / access instructions<textarea value={dogEditor.gate_access_notes || ''} onChange={e=>setDogEditor({...dogEditor,gate_access_notes:e.target.value})}/></label>
                <label style={{gridColumn:'1 / -1'}}>Parking / driveway notes<textarea value={dogEditor.parking_notes || ''} onChange={e=>setDogEditor({...dogEditor,parking_notes:e.target.value})}/></label>
                <label style={{gridColumn:'1 / -1'}}>Client notes<textarea value={dogEditor.client_notes || ''} onChange={e=>setDogEditor({...dogEditor,client_notes:e.target.value})}/></label>
                <label>Preferred window<select value={dogEditor.preferred_appointment_window || ''} onChange={e=>setDogEditor({...dogEditor,preferred_appointment_window:e.target.value})}><option value="">No preference</option><option>Morning</option><option>Midday</option><option>Afternoon</option></select></label>
                <label>Usual time<input type="time" value={dogEditor.preferred_time || ''} onChange={e=>setDogEditor({...dogEditor,preferred_time:e.target.value})}/></label>
                <label>Contact preference<select value={dogEditor.contact_preference || 'Text'} onChange={e=>setDogEditor({...dogEditor,contact_preference:e.target.value})}><option>Text</option><option>Call</option><option>Either</option></select></label>
                <label>Status<select value={dogEditor.client_status || 'Active'} onChange={e=>setDogEditor({...dogEditor,client_status:e.target.value})}><option>Active</option><option>Paused</option><option>Inactive</option></select></label>
                <label>Alternate contact<input value={dogEditor.alternate_contact_name || ''} onChange={e=>setDogEditor({...dogEditor,alternate_contact_name:e.target.value})}/></label>
                <label>Alternate phone<input value={dogEditor.alternate_contact_phone || ''} onChange={e=>setDogEditor({...dogEditor,alternate_contact_phone:e.target.value})}/></label>
                <label>Receipt preference<select value={dogEditor.receipt_preference || ''} onChange={e=>setDogEditor({...dogEditor,receipt_preference:e.target.value})}><option value="">No preference</option><option>Text receipt</option><option>Email receipt</option><option>No receipt</option></select></label>
                <label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={Boolean(dogEditor.fixed_time)} onChange={e=>setDogEditor({...dogEditor,fixed_time:e.target.checked})} style={{width:20,height:20}}/>Fixed time / do not move</label>
              </>}
              <label style={{gridColumn:'1 / -1'}}>Service<select value={dogEditor.service} onChange={e=>{
                const next=e.target.value
                setDogEditor({...dogEditor,service:next,first_appointment_service:appointmentServiceOptions.includes(next)?next:(dogEditor.first_appointment_service || 'Groom')})
              }}><option>Groom</option><option>Bath Only</option><option>Partial Groom</option><option>Service Varies</option></select></label>
              <label>Groom price<input type="number" inputMode="decimal" value={dogEditor.groom_price} onChange={e=>setDogEditor({...dogEditor,groom_price:e.target.value})}/></label>
              <label>Bath price<input type="number" inputMode="decimal" value={dogEditor.bath_price} onChange={e=>setDogEditor({...dogEditor,bath_price:e.target.value})}/></label>
              <label>Partial Groom price<input type="number" inputMode="decimal" value={dogEditor.partial_groom_price} onChange={e=>setDogEditor({...dogEditor,partial_groom_price:e.target.value})}/></label>
              <label>Groom time (min)<input type="number" inputMode="numeric" value={dogEditor.groom_minutes} onChange={e=>setDogEditor({...dogEditor,groom_minutes:e.target.value})}/></label>
              <label>Bath time (min)<input type="number" inputMode="numeric" value={dogEditor.bath_minutes} onChange={e=>setDogEditor({...dogEditor,bath_minutes:e.target.value})}/></label>
              <label>Partial Groom time (min)<input type="number" inputMode="numeric" value={dogEditor.partial_groom_minutes} onChange={e=>setDogEditor({...dogEditor,partial_groom_minutes:e.target.value})}/></label>
              <label>Frequency (weeks)<select value={dogEditor.frequency_mode==='custom'?'__custom__':String(dogEditor.frequency_weeks || '')} onChange={e=>{
                const value=e.target.value
                if(value==='__custom__') setDogEditor({...dogEditor,frequency_mode:'custom',frequency_weeks:commonFrequencyOptions.includes(String(dogEditor.frequency_weeks || ''))?'':dogEditor.frequency_weeks})
                else setDogEditor({...dogEditor,frequency_mode:'preset',frequency_weeks:value})
              }}>
                <option value="">Choose frequency</option>
                {commonFrequencyOptions.map(value=><option key={value} value={value}>{value} weeks</option>)}
                <option value="__custom__">Other</option>
              </select></label>
              {dogEditor.frequency_mode==='custom' && <label>Custom weeks<input type="number" min="1" inputMode="numeric" value={dogEditor.frequency_weeks} onChange={e=>setDogEditor({...dogEditor,frequency_weeks:e.target.value})}/></label>}
              {newClientOpen && <label style={{gridColumn:'1 / -1'}}>Have we serviced this dog before?<select value={dogEditor.prior_service || 'no'} onChange={e=>setDogEditor({...dogEditor,prior_service:e.target.value,last_groom:e.target.value==='no'?'':dogEditor.last_groom,last_bath:e.target.value==='no'?'':dogEditor.last_bath})}>
                <option value="no">No — this is their first visit with us</option>
                <option value="yes">Yes — we have service history</option>
              </select></label>}
              {(!newClientOpen || dogEditor.prior_service==='yes') && <>
                <label>Last groom<input type="date" value={dogEditor.last_groom} onChange={e=>setDogEditor({...dogEditor,last_groom:e.target.value})}/></label>
                <label>Last bath<input type="date" value={dogEditor.last_bath} onChange={e=>setDogEditor({...dogEditor,last_bath:e.target.value})}/></label>
              </>}
              <div className="eyebrow" style={{gridColumn:'1 / -1',marginTop:8}}>Dog notes</div>
              <label style={{gridColumn:'1 / -1'}}>Grooming notes<textarea value={dogEditor.grooming_notes || ''} onChange={e=>setDogEditor({...dogEditor,grooming_notes:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1'}}>Behavior / handling notes<textarea value={dogEditor.behavior_notes || ''} onChange={e=>setDogEditor({...dogEditor,behavior_notes:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1'}}>Medical / senior notes<textarea value={dogEditor.medical_notes || ''} onChange={e=>setDogEditor({...dogEditor,medical_notes:e.target.value})}/></label>
              <label style={{gridColumn:'1 / -1',display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={Boolean(dogEditor.alternate_service)} onChange={e=>setDogEditor({...dogEditor,alternate_service:e.target.checked})} style={{width:20,height:20}}/>Alternate services</label>
              {dogEditor.alternate_service && <><label>Alternate 1<select value={dogEditor.alternate_service_1 || 'Groom'} onChange={e=>setDogEditor({...dogEditor,alternate_service_1:e.target.value})}><option>Groom</option><option>Partial Groom</option><option>Bath Only</option></select></label><label>Alternate 2<select value={dogEditor.alternate_service_2 || 'Bath Only'} onChange={e=>setDogEditor({...dogEditor,alternate_service_2:e.target.value})}><option>Groom</option><option>Partial Groom</option><option>Bath Only</option></select></label></>}
              {newClientOpen && dogEditor.prior_service==='no' && <div className="prototype-note" style={{gridColumn:'1 / -1',margin:0}}>
                Leave Last Groom / Last Bath blank. When you complete their first appointment, Grooming Planner will automatically save that service as their real history.
              </div>}

              {newClientOpen && <div className="additional-dogs" style={{gridColumn:'1 / -1',display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:10,minWidth:0}}>
                {(dogEditor.additional_dogs || []).map((extraDog,index) => <div key={index} className="form-grid additional-dog-card" style={{minWidth:0,border:'1px solid #e7e4de',borderRadius:16,padding:14,display:'grid',gap:10,background:'#fbfaf8'}}>
                  <div style={{gridColumn:'1 / -1',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,minWidth:0}}>
                    <strong style={{fontSize:15,color:'#172038'}}>Dog {index + 2}</strong>
                    <button type="button" className="secondary-btn" onClick={()=>removeAdditionalDog(index)} style={{padding:'8px 10px'}}>Remove</button>
                  </div>
                  <label style={{gridColumn:'1 / -1'}}>Dog name<input value={extraDog.dog || ''} onChange={e=>updateAdditionalDog(index,{dog:e.target.value})}/></label>
                  <label style={{gridColumn:'1 / -1'}}>Service<select value={extraDog.service || 'Groom'} onChange={e=>{
                    const next=e.target.value
                    updateAdditionalDog(index,{service:next,first_appointment_service:appointmentServiceOptions.includes(next)?next:(extraDog.first_appointment_service || 'Groom')})
                  }}><option>Groom</option><option>Bath Only</option><option>Partial Groom</option><option>Service Varies</option></select></label>
                  <label>Groom price<input type="number" inputMode="decimal" value={extraDog.groom_price || ''} onChange={e=>updateAdditionalDog(index,{groom_price:e.target.value})}/></label>
                  <label>Bath price<input type="number" inputMode="decimal" value={extraDog.bath_price || ''} onChange={e=>updateAdditionalDog(index,{bath_price:e.target.value})}/></label>
                  <label>Partial Groom price<input type="number" inputMode="decimal" value={extraDog.partial_groom_price || ''} onChange={e=>updateAdditionalDog(index,{partial_groom_price:e.target.value})}/></label>
                  <label>Groom time (min)<input type="number" inputMode="numeric" value={extraDog.groom_minutes || ''} onChange={e=>updateAdditionalDog(index,{groom_minutes:e.target.value})}/></label>
                  <label>Bath time (min)<input type="number" inputMode="numeric" value={extraDog.bath_minutes || ''} onChange={e=>updateAdditionalDog(index,{bath_minutes:e.target.value})}/></label>
                  <label>Partial Groom time (min)<input type="number" inputMode="numeric" value={extraDog.partial_groom_minutes || ''} onChange={e=>updateAdditionalDog(index,{partial_groom_minutes:e.target.value})}/></label>
                  <label>Frequency (weeks)<select value={extraDog.frequency_mode==='custom'?'__custom__':String(extraDog.frequency_weeks || '')} onChange={e=>{
                    const value=e.target.value
                    if(value==='__custom__') updateAdditionalDog(index,{frequency_mode:'custom',frequency_weeks:commonFrequencyOptions.includes(String(extraDog.frequency_weeks || ''))?'':extraDog.frequency_weeks})
                    else updateAdditionalDog(index,{frequency_mode:'preset',frequency_weeks:value})
                  }}>
                    <option value="">Choose frequency</option>
                    {commonFrequencyOptions.map(value=><option key={value} value={value}>{value} weeks</option>)}
                    <option value="__custom__">Other</option>
                  </select></label>
                  {extraDog.frequency_mode==='custom' && <label>Custom weeks<input type="number" min="1" inputMode="numeric" value={extraDog.frequency_weeks || ''} onChange={e=>updateAdditionalDog(index,{frequency_weeks:e.target.value})}/></label>}
                  <label style={{gridColumn:'1 / -1'}}>Have we serviced this dog before?<select value={extraDog.prior_service || 'no'} onChange={e=>updateAdditionalDog(index,{prior_service:e.target.value,last_groom:e.target.value==='no'?'':extraDog.last_groom,last_bath:e.target.value==='no'?'':extraDog.last_bath})}>
                    <option value="no">No — first visit with us</option>
                    <option value="yes">Yes — we have service history</option>
                  </select></label>
                  {extraDog.prior_service==='yes' && <>
                    <label>Last groom<input type="date" value={extraDog.last_groom || ''} onChange={e=>updateAdditionalDog(index,{last_groom:e.target.value})}/></label>
                    <label>Last bath<input type="date" value={extraDog.last_bath || ''} onChange={e=>updateAdditionalDog(index,{last_bath:e.target.value})}/></label>
                  </>}
                  <div className="eyebrow" style={{gridColumn:'1 / -1',marginTop:8}}>Dog notes</div>
                  <label style={{gridColumn:'1 / -1'}}>Grooming notes<textarea value={extraDog.grooming_notes || ''} onChange={e=>updateAdditionalDog(index,{grooming_notes:e.target.value})}/></label>
                  <label style={{gridColumn:'1 / -1'}}>Behavior / handling notes<textarea value={extraDog.behavior_notes || ''} onChange={e=>updateAdditionalDog(index,{behavior_notes:e.target.value})}/></label>
                  <label style={{gridColumn:'1 / -1'}}>Medical / senior notes<textarea value={extraDog.medical_notes || ''} onChange={e=>updateAdditionalDog(index,{medical_notes:e.target.value})}/></label>
                  <label style={{gridColumn:'1 / -1',display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={Boolean(extraDog.alternate_service)} onChange={e=>updateAdditionalDog(index,{alternate_service:e.target.checked})} style={{width:20,height:20}}/>Alternate services</label>
                  {extraDog.alternate_service && <><label>Alternate 1<select value={extraDog.alternate_service_1 || 'Groom'} onChange={e=>updateAdditionalDog(index,{alternate_service_1:e.target.value})}><option>Groom</option><option>Partial Groom</option><option>Bath Only</option></select></label><label>Alternate 2<select value={extraDog.alternate_service_2 || 'Bath Only'} onChange={e=>updateAdditionalDog(index,{alternate_service_2:e.target.value})}><option>Groom</option><option>Partial Groom</option><option>Bath Only</option></select></label></>}
                </div>)}
                <button type="button" className="secondary-btn" onClick={()=>setDogEditor(current=>({...current,additional_dogs:[...(current.additional_dogs || []),blankAdditionalDog()]}))} style={{justifyContent:'center',padding:'12px 14px'}}>
                  <Plus size={16}/> Add another dog
                </button>
              </div>}

              {newClientOpen && dogEditor.prior_service==='no' && <div style={{gridColumn:'1 / -1',border:'1px solid #e7e4de',borderRadius:14,padding:12,display:'grid',gap:10}}>
                <label style={{display:'flex',gap:10,alignItems:'center',fontSize:13,fontWeight:800,width:'100%',minWidth:0,lineHeight:1.35}}>
                  <input type="checkbox" checked={Boolean(dogEditor.first_appointment_booked)} onChange={e=>setDogEditor({...dogEditor,first_appointment_booked:e.target.checked})} style={{width:22,height:22,minWidth:22,flex:'0 0 22px',margin:0,padding:0}}/>
                  <span style={{minWidth:0,whiteSpace:'normal',overflowWrap:'anywhere'}}>First appointment is already booked</span>
                </label>
                {dogEditor.first_appointment_booked && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <label style={{gridColumn:'1 / -1'}}>First appointment date<input type="date" value={dogEditor.first_appointment_date || ''} onChange={e=>setDogEditor({...dogEditor,first_appointment_date:e.target.value,first_appointment_override:false})}/></label>
                  <label>Groomer<select value={dogEditor.first_appointment_groomer || 'Jen'} onChange={e=>{
                    const next=e.target.value
                    const previousDefault=defaultFirstStopTime(dogEditor.first_appointment_groomer)
                    setDogEditor({...dogEditor,first_appointment_groomer:next,first_appointment_time:(!dogEditor.first_appointment_time || dogEditor.first_appointment_time===previousDefault)?defaultFirstStopTime(next):dogEditor.first_appointment_time,first_appointment_override:false})
                  }}><option>Jen</option><option>Haley</option></select></label>
                  <label>Time<input type="time" value={dogEditor.first_appointment_time || defaultFirstStopTime(dogEditor.first_appointment_groomer)} onChange={e=>setDogEditor({...dogEditor,first_appointment_time:e.target.value})}/></label>
                  <div style={{gridColumn:'1 / -1',display:'grid',gap:8}}>
                    <label>{dogEditor.dog || 'Dog 1'} service<select value={dogEditor.first_appointment_service || dogEditor.service || 'Groom'} onChange={e=>setDogEditor({...dogEditor,first_appointment_service:e.target.value})}>{appointmentServiceOptions.map(service=><option key={service}>{service}</option>)}</select></label>
                    {(dogEditor.additional_dogs || []).map((extraDog,index)=><label key={index}>{extraDog.dog || `Dog ${index+2}`} service<select value={extraDog.first_appointment_service || extraDog.service || 'Groom'} onChange={e=>updateAdditionalDog(index,{first_appointment_service:e.target.value})}>{appointmentServiceOptions.map(service=><option key={service}>{service}</option>)}</select></label>)}
                  </div>
                  <label style={{gridColumn:'1 / -1',display:'flex',gap:10,alignItems:'flex-start',fontSize:13,fontWeight:700,width:'100%',minWidth:0,lineHeight:1.35}}>
                    <input type="checkbox" checked={Boolean(dogEditor.first_appointment_fixed)} onChange={e=>setDogEditor({...dogEditor,first_appointment_fixed:e.target.checked})} style={{width:22,height:22,minWidth:22,flex:'0 0 22px',margin:0,padding:0}}/>
                    <span style={{minWidth:0,whiteSpace:'normal',overflowWrap:'anywhere'}}>Fixed time (otherwise the normal ±30 minute arrival window applies)</span>
                  </label>
                  {schedulingOverrideReasons(dogEditor.first_appointment_date,dogEditor.first_appointment_groomer,['Jen','Haley'].includes(dogEditor.groomer)?[dogEditor.groomer]:[]).length > 0 && <div className="schedule-check warning" style={{gridColumn:'1 / -1',margin:0}}>
                    <div className="schedule-check-title">Outside normal scheduling rules</div>
                    {schedulingOverrideReasons(dogEditor.first_appointment_date,dogEditor.first_appointment_groomer,['Jen','Haley'].includes(dogEditor.groomer)?[dogEditor.groomer]:[]).map((reason,index)=><div key={index}>• {reason}</div>)}
                    <label style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontWeight:800}}>
                      <input type="checkbox" checked={Boolean(dogEditor.first_appointment_override)} onChange={e=>setDogEditor({...dogEditor,first_appointment_override:e.target.checked})} style={{width:20,height:20,minWidth:20,margin:0}}/>
                      <span>Manual override — book this first appointment anyway</span>
                    </label>
                  </div>}
                </div>}
              </div>}
            </div>
            <div className="prototype-note" style={{marginTop:12}}>Usual service: Groom, Bath Only, Partial Groom, or Service Varies. Each service can have its own price and time. For a brand-new client, use Add another dog for households with multiple dogs. Do not use an upcoming appointment as Last Groom or Last Bath — schedule the first visit separately above.</div>
            {dogMessage && <div className="login-message" style={{marginTop:10}}>{dogMessage}</div>}
            {newClientOpen && <div className="prototype-note" style={{marginTop:10,display:'flex',gap:10,justifyContent:'space-between',alignItems:'center'}}><span role="status">{draftMessage || 'Your entries save as you type. Closing this form keeps your draft.'}</span><button type="button" className="ghost" disabled={dogSaving} onClick={clearNewClientDraft}>Clear draft</button></div>}
            <div className="sheet-actions"><button className="ghost" disabled={dogSaving} onClick={()=>{setDogEditor(null);setNewClientOpen(false)}}>{newClientOpen?'Close':'Cancel'}</button><button className="save" disabled={dogSaving} onClick={()=>saveDogForm(dogEditor,newClientOpen)}>{dogSaving?'Saving…':'Save'}</button></div>
          </div>
        </div>
      )}

      {selectedClient && (
        <div className="sheet-backdrop" onMouseDown={() => setSelectedClient(null)}>
          <div className="sheet" onMouseDown={event => event.stopPropagation()} style={{maxHeight:'88dvh',overflowY:'auto'}}>
            <div className="sheet-handle" />

            <div className="sheet-title">
              <div>
                <span>Client profile</span>
                <h2>{selectedClient.owner}</h2>
                <p>{selectedClient.dogs.join(' + ')}</p>
              </div>

              <button className="icon-btn" onClick={() => setSelectedClient(null)}>
                <X size={18}/>
              </button>
            </div>

            <div style={{
              margin:'2px 0 16px',
              padding:'13px 14px',
              borderRadius:15,
              border:`1px solid ${selectedClient.scheduleInfo ? '#c9dced' : ['Overdue','Due today','Due this week','Due soon'].includes(selectedClient.dueInfo.status) ? '#ead39d' : '#e5e2dc'}`,
              background:selectedClient.scheduleInfo ? '#eef5fb' : ['Overdue','Due today','Due this week','Due soon'].includes(selectedClient.dueInfo.status) ? '#fff7e8' : '#f8f7f4'
            }}>
              {selectedClient.scheduleInfo ? (
                <>
                  <div style={{fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:'.08em',color:'#647187'}}>Next appointment</div>
                  <div style={{fontSize:15,fontWeight:900,color:'#172038',marginTop:4}}>
                    {textDate(selectedClient.scheduleInfo.date)}{selectedClient.scheduleInfo.time ? ` · ${displayClockTime(selectedClient.scheduleInfo.time)}` : ''}
                  </div>
                  <div style={{fontSize:12,color:'#59616e',marginTop:3}}>
                    {[selectedClient.scheduleInfo.groomer,selectedClient.scheduleInfo.dogs].filter(Boolean).join(' · ')}
                  </div>
                </>
              ) : (
                <>
                  <div style={{fontSize:11,fontWeight:900,textTransform:'uppercase',letterSpacing:'.08em',color:'#7a5719'}}>Rebook status</div>
                  <div style={{fontSize:15,fontWeight:900,color:'#172038',marginTop:4}}>
                    {['Overdue','Due today','Due this week','Due soon'].includes(selectedClient.dueInfo.status) ? 'Needs scheduling' : 'No appointment booked'}
                  </div>
                  <div style={{fontSize:12,color:'#59616e',marginTop:3}}>
                    {selectedClient.dueInfo.status}{selectedClient.dueInfo.dueDate ? ` · next due ${textDate(selectedClient.dueInfo.dueDate)}` : ''}
                  </div>
                </>
              )}
            </div>

            {!viewerMode && <div className="client-quick-actions">
              <button type="button" disabled={!selectedClient.phone} onClick={()=>{
                if (selectedClient.scheduleInfo) openSms(selectedClient.phone,confirmationMessage({owner:selectedClient.owner,dogs:selectedClient.scheduleInfo.dogs || selectedClient.dogs.join(' + '),date:selectedClient.scheduleInfo.date,time:selectedClient.scheduleInfo.time}))
                else openSms(selectedClient.phone)
              }}><MessageCircle size={15}/>{selectedClient.scheduleInfo ? 'Text confirmation' : 'Text client'}</button>
              <button type="button" disabled={!selectedClient.phone} onClick={()=>openCall(selectedClient.phone)}>Call</button>
              <button type="button" onClick={()=>{onRebook?.(selectedClient);setSelectedClient(null)}}><CalendarDays size={15}/> Book appointment</button>
            </div>}

            {!viewerMode && !selectedClient.scheduleInfo && <div className="communication-card">
              <div><strong>Rebooking text</strong><span>Choose the day you will be in {selectedClient.area || 'their area'}.</span></div>
              <div className="rebook-text-row">
                <input type="date" value={rebookTextDate} min={businessDateKey()} onChange={event=>setRebookTextDate(event.target.value)} aria-label="Date you will be in this client's area"/>
                <button type="button" disabled={!selectedClient.phone || !rebookTextDate} onClick={()=>openSms(selectedClient.phone,rebookingMessage({owner:selectedClient.owner,date:rebookTextDate}))}><MessageCircle size={14}/> Text rebooking</button>
              </div>
              {rebookTextDate && <div className="communication-preview">{rebookingMessage({owner:selectedClient.owner,date:rebookTextDate})}</div>}
            </div>}

            <div className="form-grid">
              <label>
                Phone
                <input readOnly value={viewerMode ? 'Hidden in viewer mode' : (selectedClient.phone || '—')} />
              </label>

              <label>
                Groomer
                <input readOnly value={selectedClient.groomer || '—'} />
              </label>

              <label style={{gridColumn:'1 / -1'}}>
                Address
                <input
                  readOnly
                  value={viewerMode ? 'Hidden in viewer mode' : ([selectedClient.address,selectedClient.city,selectedClient.state,selectedClient.zip].filter(Boolean).join(', ') || '—')}
                />
              </label>

              <label style={{gridColumn:'1 / -1'}}>
                Area
                <select
                  value={addingArea ? '__new__' : areaEditValue}
                  disabled={viewerMode || areaSaving}
                  onChange={event => {
                    const value = event.target.value
                    setAreaMessage('')
                    if (value === '__new__') {
                      setAddingArea(true)
                      setNewArea('')
                    } else {
                      setAddingArea(false)
                      setAreaEditValue(value)
                    }
                  }}
                  style={{width:'100%'}}
                >
                  {!areaEditValue && <option value="">Choose an area</option>}
                  {areaEditValue && !areaOptions.includes(areaEditValue) && (
                    <option value={areaEditValue}>{areaEditValue}</option>
                  )}
                  {areaOptions.map(area => <option key={area} value={area}>{area}</option>)}
                  <option value="__new__">+ Add new area</option>
                </select>
              </label>

              {!viewerMode && (addingArea ? (
                <div style={{gridColumn:'1 / -1',display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'end'}}>
                  <label>
                    New area name
                    <input
                      value={newArea}
                      disabled={areaSaving}
                      placeholder="Example: Tomball"
                      onChange={event => setNewArea(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-mini"
                    disabled={areaSaving || !newArea.trim()}
                    onClick={() => saveClientArea(newArea)}
                    style={{height:46,marginBottom:1}}
                  >
                    {areaSaving ? 'Saving…' : 'Add & save'}
                  </button>
                </div>
              ) : (
                <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'flex-end'}}>
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={areaSaving || !areaEditValue || canonicalAreaLabel(selectedClient.area) === canonicalAreaLabel(areaEditValue)}
                    onClick={() => saveClientArea(areaEditValue)}
                  >
                    {areaSaving ? 'Saving…' : 'Save Area'}
                  </button>
                </div>
              ))}

              {areaMessage && (
                <div className="prototype-note" style={{gridColumn:'1 / -1',marginTop:-2}} role="status">
                  {areaMessage}
                </div>
              )}

              <label style={{gridColumn:'1 / -1'}}>
                Preferred payment
                <select
                  value={paymentPreference}
                  disabled={viewerMode || paymentPreferenceSaving}
                  onChange={event=>{setPaymentPreference(event.target.value);setPaymentPreferenceMessage('')}}
                >
                  <option value="">No preference</option>
                  {PAYMENT_METHOD_OPTIONS.map(method=><option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              {!viewerMode && <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                <div style={{fontSize:11,color:'#7b828e'}}>{paymentPreference ? paymentMethodDetails(paymentPreference) : 'Payment total texts will use the standard message.'}</div>
                <button type="button" className="secondary-btn" disabled={paymentPreferenceSaving} onClick={savePaymentPreference}>{paymentPreferenceSaving?'Saving…':'Save payment preference'}</button>
              </div>}
              {paymentPreferenceMessage && <div className="prototype-note" style={{gridColumn:'1 / -1',marginTop:-2}} role="status">{paymentPreferenceMessage}</div>}

              {!viewerMode && clientDetails && <div style={{gridColumn:'1 / -1',borderTop:'1px solid #ebe8e2',paddingTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="eyebrow" style={{gridColumn:'1 / -1'}}>Client preferences</div>
                <label style={{gridColumn:'1 / -1'}}>Gate / access<textarea value={clientDetails.gate_access_notes} onChange={e=>setClientDetails({...clientDetails,gate_access_notes:e.target.value})}/></label>
                <label style={{gridColumn:'1 / -1'}}>Parking / driveway<textarea value={clientDetails.parking_notes} onChange={e=>setClientDetails({...clientDetails,parking_notes:e.target.value})}/></label>
                <label style={{gridColumn:'1 / -1'}}>Client notes<textarea value={clientDetails.client_notes} onChange={e=>setClientDetails({...clientDetails,client_notes:e.target.value})}/></label>
                <label>Preferred window<select value={clientDetails.preferred_appointment_window} onChange={e=>setClientDetails({...clientDetails,preferred_appointment_window:e.target.value})}><option value="">No preference</option><option>Morning</option><option>Midday</option><option>Afternoon</option></select></label>
                <label>Usual time<input type="time" value={clientDetails.preferred_time} onChange={e=>setClientDetails({...clientDetails,preferred_time:e.target.value})}/></label>
                <label>Contact<select value={clientDetails.contact_preference} onChange={e=>setClientDetails({...clientDetails,contact_preference:e.target.value})}><option>Text</option><option>Call</option><option>Either</option></select></label>
                <label>Status<select value={clientDetails.client_status} onChange={e=>setClientDetails({...clientDetails,client_status:e.target.value})}><option>Active</option><option>Paused</option><option>Inactive</option></select></label>
                <label>Alternate contact<input value={clientDetails.alternate_contact_name} onChange={e=>setClientDetails({...clientDetails,alternate_contact_name:e.target.value})}/></label>
                <label>Alternate phone<input value={clientDetails.alternate_contact_phone} onChange={e=>setClientDetails({...clientDetails,alternate_contact_phone:e.target.value})}/></label>
                <label>Receipt<select value={clientDetails.receipt_preference} onChange={e=>setClientDetails({...clientDetails,receipt_preference:e.target.value})}><option value="">No preference</option><option>Text receipt</option><option>Email receipt</option><option>No receipt</option></select></label>
                <label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={Boolean(clientDetails.fixed_time)} onChange={e=>setClientDetails({...clientDetails,fixed_time:e.target.checked})} style={{width:20,height:20}}/>Fixed time / do not move</label>
                <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><span style={{fontSize:11,color:'#7b828e'}}>{clientDetailsMessage}</span><button type="button" className="secondary-btn" disabled={clientDetailsSaving} onClick={saveClientDetails}>{clientDetailsSaving?'Saving…':'Save client details'}</button></div>
              </div>}

              <label>
                Dogs
                <input readOnly value={selectedClient.dogs.join(', ') || '—'} />
              </label>
            </div>

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>Dogs & services</div>
              <div className="client-list">
                {selectedClient.rows.map((row, index) => {
                  const dog = valueOf(row, 'dog', 'Dog') || 'Unnamed dog'
                  const servicePattern = valueOf(row, 'service_pattern', 'Service Pattern')
                  const nextService = canonicalServiceLabel(servicePattern) || canonicalServiceLabel(valueOf(row, 'next_service', 'Next Service'))
                  const price = valueOf(row, 'price', 'Price')
                  const minutes = valueOf(row, 'minutes', 'Minutes')
                  const frequency = valueOf(row, 'frequency_weeks', 'Frequency Weeks')
                  const lastGroom = valueOf(row, 'last_groom', 'Last Groom', 'last_groom_date', 'Last Groom Date')
                  const lastBath = valueOf(row, 'last_bath', 'Last Bath', 'last_bath_date', 'Last Bath Date')
                  const baseDue = dogDueInfo(row)
                  const due = scheduledDueInfo(baseDue,selectedClient.scheduleInfo)

                  return (
                    <div
                      key={`${dog}-${index}`}
                      style={{
                        background:'#fff',
                        border:'1px solid #ebe8e2',
                        borderRadius:14,
                        padding:'12px 14px',
                        marginBottom:8
                      }}
                    >
                      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start'}}>
                        <div style={{minWidth:0}}>
                          <strong style={{display:'block',fontSize:15,color:'#172038'}}>{dog}</strong>
                          <div style={{fontSize:11,color:'#7b828e',marginTop:3}}>
                            {[nextService || servicePattern, frequency !== '' ? `Every ${frequency} wks` : ''].filter(Boolean).join(' · ') || 'Service details not set'}
                          </div>
                        </div>
                        {!viewerMode && <button type="button" className="secondary-btn" onClick={() => { setDogMessage(''); editDog(row) }} style={{flex:'0 0 auto'}}>Edit</button>}
                      </div>

                      {!lastGroom && !lastBath ? (
                        <div style={{marginTop:10,padding:'9px 10px',borderRadius:11,background:selectedClient.scheduleInfo ? '#eef5fb' : '#f7f7f5',border:'1px solid #e3e2de',fontSize:11.5,color:'#59616e'}}>
                          {selectedClient.scheduleInfo
                            ? `No completed service yet · first visit ${textDate(selectedClient.scheduleInfo.date)}${selectedClient.scheduleInfo.time ? ` at ${displayClockTime(selectedClient.scheduleInfo.time)}` : ''}`
                            : 'No completed service history yet.'}
                        </div>
                      ) : (
                        <div style={{fontSize:11.5,color:'#59616e',lineHeight:1.55,marginTop:10}}>
                          {lastGroom && <div><strong>Last groom:</strong> {textDate(lastGroom)}</div>}
                          {lastBath && <div><strong>Last bath:</strong> {textDate(lastBath)}</div>}
                        </div>
                      )}

                      <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginTop:10,paddingTop:9,borderTop:'1px solid #eeeae4'}}>
                        <div>
                          <div style={{fontSize:10.5,fontWeight:850,textTransform:'uppercase',letterSpacing:'.05em',color:'#8a919d'}}>Next due</div>
                          <div style={{fontSize:12,fontWeight:800,color:'#172038',marginTop:2}}>{due.dueDate ? textDate(due.dueDate) : 'Not set'}</div>
                        </div>
                        <div style={{fontSize:10.5,fontWeight:850,padding:'4px 7px',borderRadius:999,background:
                          due.scheduled ? '#eef5fb' : due.status === 'Overdue' ? '#fff0ef' : ['Due today','Due this week'].includes(due.status) ? '#fff7e8' : '#f4f3f0',
                          color:due.scheduled ? '#31577a' : due.status === 'Overdue' ? '#9b3832' : ['Due today','Due this week'].includes(due.status) ? '#7a5719' : '#687080'}}>
                          {due.status}
                        </div>
                      </div>

                      {dogDetailsLookup[normalizedKey(dog)] && <div style={{fontSize:11.5,color:'#59616e',marginTop:9,lineHeight:1.5}}>
                        {dogDetailsLookup[normalizedKey(dog)].grooming_notes && <div><strong>Grooming:</strong> {dogDetailsLookup[normalizedKey(dog)].grooming_notes}</div>}
                        {dogDetailsLookup[normalizedKey(dog)].behavior_notes && <div><strong>Handling:</strong> {dogDetailsLookup[normalizedKey(dog)].behavior_notes}</div>}
                        {dogDetailsLookup[normalizedKey(dog)].medical_notes && <div><strong>Medical/senior:</strong> {dogDetailsLookup[normalizedKey(dog)].medical_notes}</div>}
                        {dogDetailsLookup[normalizedKey(dog)].alternate_service && <div><strong>Alternates:</strong> {dogDetailsLookup[normalizedKey(dog)].alternate_service_1} ↔ {dogDetailsLookup[normalizedKey(dog)].alternate_service_2}</div>}
                      </div>}
                      <div style={{fontSize:11.5,color:'#7b828e',marginTop:9,lineHeight:1.5}}>
                        {[servicePattern,
                          price !== '' ? `$${price}` : '',
                          minutes !== '' ? `${minutes} min` : '',
                        ].filter(Boolean).join(' · ') || 'Saved price/time not set'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {!viewerMode && <div style={{display:'flex',justifyContent:'flex-end',marginTop:10}}>
              <button type="button" className="primary-mini" onClick={() => { const form=blankDogForm(selectedClient); setDogMessage(''); setDogEditor(form); setSelectedClient(null) }}><Plus size={15}/>Add Dog</button>
            </div>}

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>Appointment history</div>
              {historyLoading && <div className="prototype-note">Loading appointment history…</div>}
              {historyError && <div className="login-message">{historyError}</div>}
              {!historyLoading && !historyError && history.length === 0 && (
                <div className="prototype-note">No completed, cancelled, rescheduled, no-show, or past appointments found yet.</div>
              )}
              {!historyLoading && !historyError && history.length > 0 && (
                <div className="appt-list">
                  {history.slice(0,20).map(item => {
                    const needsReview = item.status === 'Needs review'
                    const CardTag = needsReview ? 'button' : 'div'
                    return (
                    <CardTag
                      className="appt-card"
                      key={item.id}
                      type={needsReview ? 'button' : undefined}
                      onClick={needsReview ? () => onOpen?.({
                        id:item.id,
                        owner:selectedClient.owner,
                        dogs:item.dogs || selectedClient.dogs.join(' + '),
                        weekStart:item.weekStart,
                        sourceRow:item.sourceRow
                      }) : undefined}
                      style={{
                        ...(needsReview ? {width:'100%',textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'} : {}),
                        background:item.status === 'Completed' ? '#edf7ef' : item.status === 'Cancelled' ? '#fff4f2' : item.status === 'Rescheduled' ? '#eef5fb' : item.status === 'No-show' ? '#fff7e8' : '#fff',
                        borderColor:item.status === 'Completed' ? '#bfd9c5' : item.status === 'Cancelled' ? '#e9c2bd' : item.status === 'Rescheduled' ? '#c9dced' : item.status === 'No-show' ? '#ead39d' : '#e5e2dc'
                      }}
                    >
                      <div className="time-pill">{item.date ? textDate(item.date).replace(/, \d{4}$/,'') : '—'}</div>
                      <div className="appt-main">
                        <div className="appt-topline">
                          <strong>{item.status}</strong>
                          <span className={`status-dot ${item.statusClass}`} />
                        </div>
                        <div className="dogs">{item.dogs || selectedClient.dogs.join(' + ')}</div>
                        <div className="meta">
                          {item.groomer && <span><Users size={14}/>{item.groomer}</span>}
                          {item.time && <span><Clock3 size={14}/>{item.time}</span>}
                          {Number.isFinite(item.price) && <span><WalletCards size={14}/>${Math.round(item.price)}</span>}
                        </div>
                        {item.status === 'Completed' && item.completedDate && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>Completed {textDate(item.completedDate)}</div>
                        )}
                        {item.status === 'Cancelled' && item.cancelledDate && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>Cancelled {textDate(item.cancelledDate)}</div>
                        )}
                        {item.status === 'Rescheduled' && item.rescheduledTo && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>Moved to {textDate(item.rescheduledTo)}</div>
                        )}
                        {item.status === 'No-show' && item.date && (
                          <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>No-show on {textDate(item.date)}</div>
                        )}
                        {item.note && <div style={{fontSize:11,color:'#7b828e',marginTop:5}}>{item.note}</div>}
                        {needsReview && <div style={{fontSize:11,color:'#53617a',marginTop:6,fontWeight:700}}>Tap to review →</div>}
                      </div>
                    </CardTag>
                  )})}
                </div>
              )}
              {history.length > 20 && (
                <div className="prototype-note">Showing the 20 most recent history entries.</div>
              )}
            </div>

            {selectedClient.notes && (
              <div style={{marginTop:14}}>
                <div className="eyebrow" style={{marginBottom:6}}>Notes</div>
                <div className="prototype-note">{selectedClient.notes}</div>
              </div>
            )}

            <div className="sheet-actions">
              <button className="save" onClick={() => setSelectedClient(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default Clients

