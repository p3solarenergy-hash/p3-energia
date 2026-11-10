/* Monitoramento: o ShowRoom público do SolarView (geração ao vivo das usinas) aberto dentro da plataforma.
   É só a tela deles num quadro — os números não entram na base da P3 (para isso, a API do SolarView).
   Se trocar o link, libere o domínio novo no frame-src do index.html. */
(function () {
  "use strict";
  const { esc } = window.P3;
  const SHOWROOM = "https://my.solarview.com.br/ShowRoom/MjAyMzAy";

  // color-scheme normal: o tema escuro da P3 faria o Chrome esconder o conteúdo do quadro.
  function render(main) {
    main.innerHTML = `
      <div class="head"><div><p class="kicker">SolarView · ao vivo</p><h1>Monitoramento</h1>
        <p>Geração das usinas em tempo real, direto do ShowRoom do SolarView.</p></div>
        <div class="actions"><a class="btn" href="${esc(SHOWROOM)}" target="_blank" rel="noopener">Abrir em nova aba ↗</a></div></div>
      <iframe class="monitor" src="${esc(SHOWROOM)}" title="Monitoramento SolarView" loading="lazy" allowfullscreen
        referrerpolicy="no-referrer" style="color-scheme:normal;width:100%;height:calc(100vh - 190px);min-height:480px;border:1px solid var(--line);border-radius:var(--radius);background:#1b1b1b"></iframe>`;
  }

  window.P3.register("monitoramento", { render });
})();
