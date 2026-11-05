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

  // Dine-in NFC / table tags. A tag opens a page with
  //   ?utm_source=nfc_table&utm_medium=offline&utm_campaign=dinein_menu[&table=12]
  // Count the visit once per page per tab session; table_id only when the tag
  // itself carries a plain table number (never guessed, nothing personal). The
  // tag's parameters ride along on links marked data-nfc-carry (the homepage's
  // Dine-In Menu button), so the menu page knows where the guest came from.
  var qs = new URLSearchParams(location.search);
  if ((qs.get('utm_source') || '').toLowerCase() === 'nfc_table') {
    var nfc = { source: 'nfc_table', menu_page: page };
    var tid = qs.get('table');
    if (tid && /^[A-Za-z0-9_-]{1,12}$/.test(tid)) nfc.table_id = tid;
    var nkey = 'ga_nfc_' + page;
    var nseen = false;
    try { nseen = sessionStorage.getItem(nkey) === '1'; sessionStorage.setItem(nkey, '1'); } catch(e) {}
    if (!nseen) send('nfc_menu_visit', nfc);
    var keep = new URLSearchParams();
    ['utm_source', 'utm_medium', 'utm_campaign', 'table'].forEach(function(k){ if (qs.get(k)) keep.set(k, qs.get(k)); });
    var carry = function(){
      [].forEach.call(document.querySelectorAll('a[data-nfc-carry]'), function(a){
        var h = a.getAttribute('href') || '';
        if (h.indexOf('?') < 0) a.setAttribute('href', h + '?' + keep.toString());
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', carry); else carry();
  }

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
