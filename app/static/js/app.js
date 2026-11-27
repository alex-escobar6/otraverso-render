document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.gallery-thumbs img').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      var main = document.querySelector('.gallery-main img');
      if (!main) return;
      main.src = thumb.dataset.full || thumb.src;
      document.querySelectorAll('.gallery-thumbs img').forEach(function (item) {
        item.classList.remove('active');
      });
      thumb.classList.add('active');
    });
  });

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  });

  document.querySelectorAll('a[data-wa-log]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var csrf = link.dataset.waCsrf || '';
      if (!csrf || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      var body = new URLSearchParams({
        csrf: csrf,
        source: link.dataset.waLog,
        path: window.location.pathname,
        url: link.dataset.waUrl || link.href,
        message: link.dataset.waMessage || ''
      });
      var navigate = function () { window.location.assign(link.href); };
      if (window.fetch) {
        window.fetch('/shop/whatsapp/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body,
          keepalive: true
        }).then(navigate, navigate);
      } else {
        navigate();
      }
    });
  });
});
