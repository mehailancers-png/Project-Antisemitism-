import { isConfigured } from "./firebase.js";
import { watchAuth, sendOtp, verifyOtp, cancelOtp, logout, ensureProfile, friendlyError } from "./auth.js";
import { subscribeConversations, lookupUserByPhone, getOrCreateConversation, otherParticipant, normalizePhone } from "./chats.js";
import { subscribeContacts, saveContact, deleteContact, labelFor } from "./contacts.js";
import { subscribeMessages, sendMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);
let me = null, profile = null, convs = [], contacts = {};
let activeId = null, activeOther = null, foundUser = null, pendingPhone = "", authNotice = "";
let unsubConvs = null, unsubContacts = null, unsubMsgs = null;
let convsLoaded = false, contactsLoaded = false;
let sending = false, stickBottom = true, toastTimer = null, cooldownTimer = null;

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
  for (const u of [unsubConvs, unsubContacts, unsubMsgs]) if (u) u();
  unsubConvs = unsubContacts = unsubMsgs = null;
  me = profile = null; convs = []; contacts = {};
  activeId = null; activeOther = null; foundUser = null;
  convsLoaded = contactsLoaded = false;
  document.body.classList.remove("chat-open");
  $("convList").replaceChildren(); $("messages").replaceChildren();
  $("chatView").hidden = true; $("chatPlaceholder").hidden = false;
  $("newChatPanel").hidden = true; $("foundCard").hidden = true; $("contactPanel").hidden = true;
}

/* ---------- network status ---------- */
function updateNet() { $("netBanner").hidden = navigator.onLine; }
window.addEventListener("online", updateNet);
window.addEventListener("offline", updateNet);
updateNet();

/* ---------- phone sign-in UI ---------- */
function resetAuthForms() {
  clearInterval(cooldownTimer); cancelOtp();
  $("phoneForm").hidden = false; $("otpForm").hidden = true;
  $("otpInput").value = ""; pendingPhone = "";
  showError("phoneError", ""); showError("otpError", "");
  $("sendOtpBtn").disabled = false; $("sendOtpBtn").textContent = "Send code";
  $("verifyBtn").disabled = false; $("verifyBtn").textContent = "Verify and continue";
}
function startCooldown(seconds = 30) {
  clearInterval(cooldownTimer);
  let left = seconds; const b = $("resendBtn");
  b.disabled = true; b.textContent = `Resend code (${left}s)`;
  cooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(cooldownTimer); b.disabled = false; b.textContent = "Resend code"; }
    else b.textContent = `Resend code (${left}s)`;
  }, 1000);
}

$("phoneForm").addEventListener("submit", async (e) => {
  e.preventDefault(); showError("phoneError", "");
  const phone = normalizePhone($("phoneInput").value);
  if (!phone) return showError("phoneError", "Enter your full number with country code, e.g. +919876543210.");
  if (!navigator.onLine) return showError("phoneError", "You are offline.");
  $("sendOtpBtn").disabled = true; $("sendOtpBtn").textContent = "Sending code…";
  try {
    await sendOtp(phone);
    pendingPhone = phone;
    $("otpSentTo").textContent = phone;
    $("phoneForm").hidden = true; $("otpForm").hidden = false;
    $("otpInput").value = ""; $("otpInput").focus();
    startCooldown();
  } catch (err) {
    showError("phoneError", friendlyError(err));
  } finally {
    $("sendOtpBtn").disabled = false; $("sendOtpBtn").textContent = "Send code";
  }
});

$("otpForm").addEventListener("submit", async (e) => {
  e.preventDefault(); showError("otpError", "");
  const code = $("otpInput").value.trim();
  if (!/^\d{6}$/.test(code)) return showError("otpError", "Enter the 6-digit code from the SMS.");
  $("verifyBtn").disabled = true; $("verifyBtn").textContent = "Verifying…";
  try {
    await verifyOtp(code);          // the auth listener below takes over on success
  } catch (err) {
    showError("otpError", friendlyError(err));
    $("verifyBtn").disabled = false; $("verifyBtn").textContent = "Verify and continue";
  }
});

$("resendBtn").addEventListener("click", async () => {
  showError("otpError", "");
  if (!pendingPhone) return;
  if (!navigator.onLine) return showError("otpError", "You are offline.");
  $("resendBtn").disabled = true;
  try { await sendOtp(pendingPhone); startCooldown(); }
  catch (err) { showError("otpError", friendlyError(err)); $("resendBtn").disabled = false; $("resendBtn").textContent = "Resend code"; }
});

$("changeNumberBtn").addEventListener("click", resetAuthForms);

$("logoutBtn").addEventListener("click", async () => {
  teardown();
  try { await logout(); } catch (err) { toast(friendlyError(err)); }
});

/* ---------- conversation list ---------- */
function startConversations() {
  convsLoaded = contactsLoaded = false;
  $("convLoading").hidden = false; $("convEmpty").hidden = true;
  unsubConvs = subscribeConversations(me.uid, (items) => {
    convs = items; convsLoaded = true; renderConvs();
  }, (err) => { convsLoaded = true; renderConvs(); toast(friendlyError(err)); });
  unsubContacts = subscribeContacts(me.uid, (map) => {
    contacts = map; contactsLoaded = true; renderConvs(); updateChatHeader();
  }, (err) => { contactsLoaded = true; renderConvs(); toast(friendlyError(err)); });
}
function renderConvs() {
  if (!(convsLoaded && contactsLoaded)) return;
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
    const name = document.createElement("span"); name.className = "item-name"; name.textContent = labelFor(contacts, other.uid, other.phone);
    const time = document.createElement("span"); time.className = "item-time"; time.textContent = c.lastMessageText ? stamp(c.updatedAt) : "";
    top.append(name, time);
    const sub = document.createElement("div"); sub.className = "item-sub";
    sub.textContent = c.lastMessageText ? (c.lastSenderId === me.uid ? "You: " : "") + c.lastMessageText : "No messages yet";
    btn.append(top, sub);
    btn.addEventListener("click", () => openConversation(c.id, other));
    li.append(btn); list.append(li);
  }
}

/* ---------- find a user by phone number ---------- */
$("newChatBtn").addEventListener("click", () => {
  const panel = $("newChatPanel"); panel.hidden = !panel.hidden;
  $("newChatBtn").setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) $("searchInput").focus();
});

$("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("foundCard").hidden = true; foundUser = null;
  const phone = normalizePhone($("searchInput").value);
  if (!phone) { $("searchStatus").textContent = "Enter the full number with country code, e.g. +919876543210."; return; }
  if (phone === profile.phoneNumber) { $("searchStatus").textContent = "That is your own number."; return; }
  if (!navigator.onLine) { $("searchStatus").textContent = "You are offline."; return; }
  $("searchBtn").disabled = true; $("searchStatus").textContent = "Searching…";
  try {
    const res = await lookupUserByPhone(phone);
    if (res.self) { $("searchStatus").textContent = "That is your own number."; }
    else if (!res.found) { $("searchStatus").textContent = "No registered user found with that number."; }
    else {
      foundUser = { uid: res.uid, phoneNumber: res.phoneNumber };
      $("foundPhone").textContent = res.phoneNumber;
      $("foundName").value = contacts[res.uid] || "";
      $("foundCard").hidden = false; $("searchStatus").textContent = "";
    }
  } catch (err) {
    $("searchStatus").textContent = friendlyError(err);
  } finally {
    $("searchBtn").disabled = false;
  }
});

$("foundStartBtn").addEventListener("click", async () => {
  if (!foundUser) return;
  const user = foundUser, name = $("foundName").value.trim();
  $("foundStartBtn").disabled = true;
  try {
    const id = await getOrCreateConversation({ uid: me.uid, phoneNumber: profile.phoneNumber }, user);
    if (name) {
      try { await saveContact(me.uid, user.uid, user.phoneNumber, name); }
      catch (err) { toast("Chat opened, but the contact name was not saved: " + friendlyError(err)); }
    }
    $("newChatPanel").hidden = true; $("newChatBtn").setAttribute("aria-expanded", "false");
    $("foundCard").hidden = true; $("searchInput").value = ""; $("searchStatus").textContent = ""; foundUser = null;
    openConversation(id, { uid: user.uid, phone: user.phoneNumber });
  } catch (err) {
    toast(friendlyError(err));
  } finally {
    $("foundStartBtn").disabled = false;
  }
});

/* ---------- chat screen ---------- */
function updateChatHeader() {
  if (!activeOther) return;
  $("chatTitle").textContent = labelFor(contacts, activeOther.uid, activeOther.phone);
  $("editContactBtn").hidden = !activeOther.phone;
}
function openConversation(id, other) {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }   // listener cleanup when switching
  activeId = id; activeOther = other; stickBottom = true;
  document.body.classList.add("chat-open");
  $("chatPlaceholder").hidden = true; $("chatView").hidden = false;
  $("contactPanel").hidden = true; $("editContactBtn").setAttribute("aria-expanded", "false");
  updateChatHeader();
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
  activeId = null; activeOther = null;
  document.body.classList.remove("chat-open");
  $("chatView").hidden = true; $("chatPlaceholder").hidden = false;
  renderConvs();
}
$("backBtn").addEventListener("click", leaveConversation);

/* ---------- private contact name for the open chat ---------- */
function closeContactPanel() {
  $("contactPanel").hidden = true; $("editContactBtn").setAttribute("aria-expanded", "false");
}
$("editContactBtn").addEventListener("click", () => {
  const panel = $("contactPanel");
  if (!panel.hidden) return closeContactPanel();
  if (!activeOther || !activeOther.phone) return;
  showError("contactError", "");
  $("contactPhone").textContent = activeOther.phone;
  $("contactName").value = contacts[activeOther.uid] || "";
  $("contactDeleteBtn").hidden = !contacts[activeOther.uid];
  panel.hidden = false; $("editContactBtn").setAttribute("aria-expanded", "true");
  $("contactName").focus();
});
$("contactForm").addEventListener("submit", async (e) => {
  e.preventDefault(); showError("contactError", "");
  if (!activeOther) return;
  const name = $("contactName").value.trim();
  if (!name) return showError("contactError", "Enter a name, or use Remove to delete the saved name.");
  $("contactSaveBtn").disabled = true;
  try { await saveContact(me.uid, activeOther.uid, activeOther.phone, name); closeContactPanel(); }
  catch (err) { showError("contactError", friendlyError(err)); }
  finally { $("contactSaveBtn").disabled = false; }
});
$("contactDeleteBtn").addEventListener("click", async () => {
  if (!activeOther) return;
  showError("contactError", "");
  $("contactDeleteBtn").disabled = true;
  try { await deleteContact(me.uid, activeOther.uid); closeContactPanel(); }
  catch (err) { showError("contactError", friendlyError(err)); }
  finally { $("contactDeleteBtn").disabled = false; }
});

/* ---------- messages ---------- */
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
    toast(friendlyError(err));
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
    if (!user) {
      teardown(); resetAuthForms(); show("auth");
      if (authNotice) { showError("phoneError", authNotice); authNotice = ""; }
      return;
    }
    if (!user.phoneNumber) {                         // leftover email/other session: not supported any more
      teardown(); authNotice = "Please sign in with your phone number."; 
      try { await logout(); } catch (_) { /* ignore */ }
      return;
    }
    try {
      profile = await ensureProfile(user);
    } catch (err) {
      teardown(); authNotice = friendlyError(err);
      try { await logout(); } catch (_) { /* ignore */ }
      return;
    }
    me = user;
    $("meName").textContent = "Signed in as " + profile.phoneNumber;
    show("app");
    startConversations();
  });
    }
