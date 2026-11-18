document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    function closeMenu() {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu();
        toggle.focus();
      }
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
});
