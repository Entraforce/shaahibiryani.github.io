// Sends the actions that lead to an in-store or phone sale to Google
// Analytics 4. The existing Google Ads conversions on each page only reach the
// Ads account, so before this GA4 could not answer "did Google search lead to
// a call, a directions request or a catering inquiry?". These events go to
// GA4 only (send_to the G- id), so the Ads conversion counts do not change.
// Consent rules are unchanged: until a visitor accepts the banner, Google
// receives cookieless pings only.
(function(){
  var GA = 'G-3NJRL7V5NB';
  function send(name, params){
    if (typeof gtag !== 'function') return;
    params = params || {};
    params.send_to = GA;
    params.page_location = location.href;
    try { gtag('event', name, params); } catch(e) {}
  }
  window.shaahiTrack = send;

  var page = location.pathname.replace(/^\/|\.html$/g, '') || 'home';

  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    var where = { link_page: page, link_text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 60) };
    if (/^tel:/i.test(h)) send('phone_call', where);
    else if (/maps\.google\.|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(h)) send('get_directions', where);
    else if (/wa\.me\/|chat\.whatsapp\.com|api\.whatsapp\.com/i.test(h)) send('whatsapp_click', where);
  }, true);

  // The catering, hall and reservation forms post to FormSubmit, which sends
  // the visitor back here with ?status=thanks. Count each submission once,
  // even if the thank-you page is reloaded.
  if (/[?&]status=thanks\b/.test(location.search)) {
    var type = /catering/.test(page) || /#catering/.test(location.hash) || page === 'home' ? 'catering'
             : page === 'hall' ? 'hall_booking'
             : page === 'reserve' ? 'reservation'
             : page === 'careers' ? null
             : page;
    var key = 'ga_lead_' + page + location.search;
    var seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch(e) {}
    if (!seen) {
      if (type) send('generate_lead', { lead_type: type, form_page: page });
      else send('job_application', { form_page: page });
    }
  }
})();
