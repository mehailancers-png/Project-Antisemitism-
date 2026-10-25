import { isConfigured } from "./firebase.js";
import { watchAuth, register, login, logout, ensureProfile, friendlyError } from "./auth.js";
import { subscribeConversations, searchUsers, getOrCreateConversation, otherParticipant } from "./chats.js";
import { subscribeMessages, sendMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);
let me = null, profile = null, convs = [], activeId = null;
let unsubConvs = null, unsubMsgs = null, sending = false, stickBottom = true, toastTimer = null;

/* ---------- helpers ---------- */
function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}
function showError(id, text) { const e = $(id); e.textContent = text || ""; e.hidden = !text; }
function stamp(ts) {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate(), now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const date = d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  return `${date}, ${time}`;
}
function dayLabel(ts) {
  return ts.toDate().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function show(view) {
  $("loading").hidden = true;
  $("authView").hidden = view !== "auth";
  $("appView").hidden = view !== "app";
}
function teardown() {
  if (unsubConvs) unsubConvs();
  if (unsubMsgs) unsubMsgs();
  unsubConvs = unsubMsgs = null;
  me = profile = null; convs = []; activeId = null;
  document.body.classList.remove("chat-open");
  $("convList").replaceChildren(); $("messages").replaceChildren();
  $("chatView").hidden = true; $("chatPlaceholder").hidden = false;
  $("newChatPanel").hidden = true;
}

/* ---------- network status ---------- */
function updateNet() { $("netBanner").hidden = navigator.onLine; }
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);
updateNet();

/* ---------- auth UI ---------- */
function selectTab(login) {
  $("tabLogin").setAttribute("aria-selected", String(login));
  $("tabRegister").setAttribute("aria-selected", String(!login));
  $("loginForm").hidden = !login; $("registerForm").hidden = login;
}
$("tabLogin").addEventListener("click", () => selectTab(true));
$("tabRegister").addEventListener("click", () => selectTab(false));

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); showError("loginError", "");
  const email = $("loginEmail").value.trim(), pw = $("loginPassword").value;
  if (!$("loginEmail").checkValidity()) return showError("loginError", "Enter a valid email address.");
  if (!pw) return showError("loginError", "Enter your password.");
  $("loginBtn").disabled = true; $("loginBtn").textContent = "Logging in…";
  try { await login(email, pw); }
  catch (err) { showError("loginError", friendlyError(err)); }
  finally { $("loginBtn").disabled = false; $("loginBtn").textContent = "Log in"; }
});

$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault(); showError("registerError", "");
  const name = $("regName").value.trim(), email = $("regEmail").value.trim(), pw = $("regPassword").value;
  if (name.length < 2 || name.length > 40) return showError("registerError", "Display name must be 2–40 characters.");
  if (!$("regEmail").checkValidity()) return showError("registerError", "Enter a valid email address.");
  if (pw.length < 6) return showError("registerError", "Password must be at least 6 characters.");
  $("registerBtn").disabled = true; $("registerBtn").textContent = "Creating account…";
  try { await register(name, email, pw); }
  catch (err) { showError("registerError", friendlyError(err)); }
  finally { $("registerBtn").disabled = false; $("registerBtn").textContent = "Create account"; }
});

$("logoutBtn").addEventListener("click", async () => {
  teardown();
  try { await logout(); } catch (err) { toast(friendlyError(err)); }
});

/* ---------- conversation list ---------- */
function startConversations() {
  $("convLoading").hidden = false; $("convEmpty").hidden = true;
  unsubConvs = subscribeConversations(me.uid, (items) => { convs = items; renderConvs(); }, (err) => {
    $("convLoading").hidden = true; toast(friendlyError(err));
  });
}
function renderConvs() {
  $("convLoading").hidden = true;
  $("convEmpty").hidden = convs.length > 0;
  const list = $("convList"); list.replaceChildren();
  for (const c of convs) {
    const other = otherParticipant(c, me.uid);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "item";
    if (c.id === activeId) btn.setAttribute("aria-current", "true");
    const top = document.createElement("div"); top.className = "item-top";
    const name = document.createElement("span"); name.className = "item-name"; name.textContent = other.name;
    const time = document.createElement("span"); time.className = "item-time"; time.textContent = c.lastMessageText ? stamp(c.updatedAt) : "";
    top.append(name, time);
    const sub = document.createElement("div"); sub.className = "item-sub";
    sub.textContent = c.lastMessageText ? (c.lastSenderId === me.uid ? "You: " : "") + c.lastMessageText : "No messages yet";
    btn.append(top, sub);
    btn.addEventListener("click", () => openConversation(c.id, other.name));
    li.append(btn); list.append(li);
  }
}

/* ---------- new chat / user search ---------- */
$("newChatBtn").addEventListener("click", () => {
  const panel = $("newChatPanel"); panel.hidden = !panel.hidden;
  $("newChatBtn").setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) $("searchInput").focus();
});
$("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const term = $("searchInput").value, results = $("searchResults");
  results.replaceChildren();
  if (term.trim().length < 2) { $("searchStatus").textContent = "Type at least 2 characters."; return; }
  if (!navigator.onLine) { $("searchStatus").textContent = "You are offline."; return; }
  $("searchStatus").textContent = "Searching…";
  try {
    const users = await searchUsers(term, me.uid);
    $("searchStatus").textContent = users.length ? "" : "No users found. Names are matched from the start.";
    for (const u of users) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "item";
      const n = document.createElement("div"); n.className = "item-name"; n.textContent = u.displayName;
      const s = document.createElement("div"); s.className = "item-sub"; s.textContent = "ID ending …" + u.uid.slice(-4);
      btn.append(n, s);
      btn.addEventListener("click", () => startChat(u, btn));
      li.append(btn); results.append(li);
    }
  } catch (err) { $("searchStatus").textContent = friendlyError(err); }
});
async function startChat(user, btn) {
  btn.disabled = true;
  try {
    const id = await getOrCreateConversation({ uid: me.uid, displayName: profile.displayName }, user);
    $("newChatPanel").hidden = true; $("newChatBtn").setAttribute("aria-expanded", "false");
    $("searchResults").replaceChildren(); $("searchInput").value = ""; $("searchStatus").textContent = "";
    openConversation(id, user.displayName);
  } catch (err) { toast(friendlyError(err)); btn.disabled = false; }
}

/* ---------- chat screen ---------- */
function openConversation(id, title) {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }   // listener cleanup when switching
  activeId = id; stickBottom = true;
  document.body.classList.add("chat-open");
  $("chatPlaceholder").hidden = true; $("chatView").hidden = false;
  $("chatTitle").textContent = title;
  $("messages").replaceChildren(); $("msgEmpty").hidden = true; $("msgLoading").hidden = false;
  $("msgInput").value = ""; autosize(); updateSend();
  renderConvs();
  unsubMsgs = subscribeMessages(id, (msgs) => { if (activeId === id) renderMessages(msgs); }, (err) => {
    if (activeId !== id) return;
    $("msgLoading").hidden = true; toast(friendlyError(err));
  });
}
function leaveConversation() {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  activeId = null;
  document.body.classList.remove("chat-open");
  $("chatView").hidden = true; $("chatPlaceholder").hidden = false;
  renderConvs();
}
$("backBtn").addEventListener("click", leaveConversation);

function renderMessages(msgs) {
  $("msgLoading").hidden = true;
  $("msgEmpty").hidden = msgs.length > 0;
  const ul = $("messages"); ul.replaceChildren();
  let lastDay = "";
  for (const m of msgs) {
    if (m.createdAt && m.createdAt.toDate) {
      const key = m.createdAt.toDate().toDateString();
      if (key !== lastDay) {
        lastDay = key;
        const d = document.createElement("li"); d.className = "day"; d.textContent = dayLabel(m.createdAt); ul.append(d);
      }
    }
    const li = document.createElement("li");
    li.className = "msg " + (m.senderId === me.uid ? "mine" : "theirs") + (m.pending ? " pending" : "");
    const p = document.createElement("p"); p.textContent = m.text;
    const t = document.createElement("time"); t.textContent = m.pending ? "Sending…" : stamp(m.createdAt);
    li.append(p, t); ul.append(li);
  }
  if (stickBottom) { const s = $("messageScroll"); s.scrollTop = s.scrollHeight; }
}
$("messageScroll").addEventListener("scroll", () => {
  const s = $("messageScroll");
  stickBottom = s.scrollHeight - s.scrollTop - s.clientHeight < 80;
});

/* ---------- composer ---------- */
function autosize() { const i = $("msgInput"); i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 120) + "px"; }
function updateSend() {
  $("sendBtn").disabled = sending || !$("msgInput").value.trim();
  $("sendBtn").textContent = sending ? "Sending…" : "Send";
}
$("msgInput").addEventListener("input", () => { autosize(); updateSend(); });
$("msgInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("composer").requestSubmit(); }
});
$("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (sending || !activeId) return;                 // blocks duplicate submissions
  const text = $("msgInput").value.trim();
  if (!text) return;                                // blocks empty messages
  if (!navigator.onLine) return toast("You are offline. Reconnect to send messages.");
  sending = true; updateSend(); stickBottom = true;
  try {
    await sendMessage(activeId, me.uid, text);
    $("msgInput").value = ""; autosize();
  } catch (err) {
    toast(err.code === "app/too-long" ? "Message is too long (max 2000 characters)." : friendlyError(err));
  } finally {
    sending = false; updateSend(); $("msgInput").focus();
  }
});

/* ---------- bootstrap ---------- */
if (!isConfigured) {
  show("auth");
  showError("configError", "Firebase is not configured. Add your web-app config values to js/firebase.js.");
  document.querySelectorAll("#authView form button, #authView form input").forEach((el) => { el.disabled = true; });
} else {
  watchAuth(async (user) => {
    if (!user) { teardown(); show("auth"); return; }
    try {
      profile = await ensureProfile(user);
    } catch (err) {
      teardown(); show("auth");
      showError("loginError", friendlyError(err));
      try { await logout(); } catch (_) { /* ignore */ }
      return;
    }
    me = user;
    $("meName").textContent = "Signed in as " + profile.displayName;
    show("app");
    startConversations();
  });
    }
