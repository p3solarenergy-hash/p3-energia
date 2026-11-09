// Texto do Apps Script que liga a P3 ao Google do usuário (Agenda e Google Tarefas). A tela de Tarefas mostra
// este código já com o segredo; o usuário cola em script.google.com e publica como app da Web.
(function () {
  "use strict";
  window.P3_PONTE_GOOGLE = segredo => `// P3 Energy → Google Agenda e Google Tarefas.
// Recebe as tarefas da plataforma P3 e cria/atualiza/apaga na sua conta. Só aceita pedidos com o segredo abaixo.
const SEGREDO = "${segredo}";

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.segredo !== SEGREDO) return saida({ erro: "Segredo inválido." });
    if (p.acao === "testar") return saida({ ok: true, conta: Session.getEffectiveUser().getEmail() });
    return saida(p.tipo === "evento" ? evento(p) : tarefa(p));
  } catch (err) {
    return saida({ erro: String(err && err.message || err) });
  }
}
function saida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Evento na agenda principal: com hora, dura "duracao" minutos; sem hora, é o dia inteiro.
function evento(p) {
  const cal = CalendarApp.getDefaultCalendar();
  let ev = p.id ? cal.getEventById(p.id) : null;
  if (p.acao === "excluir") { if (ev) ev.deleteEvent(); return { ok: true }; }
  if (!p.data) throw new Error("Evento precisa de data.");
  const [a, m, d] = p.data.split("-").map(Number);
  const titulo = (p.concluida ? "✓ " : "") + p.titulo;
  if (p.hora) {
    const [h, mi] = p.hora.split(":").map(Number);
    const ini = new Date(a, m - 1, d, h, mi), fim = new Date(ini.getTime() + (p.duracao || 60) * 60000);
    if (ev) ev.setTime(ini, fim); else ev = cal.createEvent(titulo, ini, fim);
  } else {
    const dia = new Date(a, m - 1, d);
    if (ev) ev.setAllDayDate(dia); else ev = cal.createAllDayEvent(titulo, dia);
  }
  ev.setTitle(titulo);
  ev.setDescription(p.descricao || "");
  return { ok: true, id: ev.getId() };
}

// Tarefa no Google Tarefas (lista padrão). O Google Tarefas guarda só a data, sem hora.
function tarefa(p) {
  const lista = "@default";
  if (p.acao === "excluir") { if (p.id) { try { Tasks.Tasks.remove(lista, p.id); } catch (e) {} } return { ok: true }; }
  const corpo = { title: p.titulo, notes: p.descricao || "", status: p.concluida ? "completed" : "needsAction" };
  if (p.data) corpo.due = p.data + "T00:00:00.000Z";
  if (!p.concluida) corpo.completed = null;
  if (p.id) { try { return { ok: true, id: Tasks.Tasks.patch(corpo, lista, p.id).id }; } catch (e) {} }
  return { ok: true, id: Tasks.Tasks.insert(corpo, lista).id };
}
`;
})();
