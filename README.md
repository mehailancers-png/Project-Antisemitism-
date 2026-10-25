# Pulse Messenger (Stage 1)

One-to-one text messaging with Firebase Authentication (email/password) and Cloud Firestore real-time listeners.
Static frontend (HTML, CSS, vanilla JS ES modules), hostable on GitHub Pages.

## Files
- `index.html`, `css/style.css`: single-page UI (login/register, chat list, chat screen)
- `js/firebase.js`: Firebase init and **your web config (must be edited)**
- `js/auth.js`: register, login, logout, profile creation, error messages
- `js/chats.js`: conversation list, user search, create/find conversation
- `js/messages.js`: message listener and sending
- `js/app.js`: UI logic
- `firestore.rules`: security rules (deploy these)

## Data model
- `users/{uid}`: `uid, displayName, searchName, createdAt` (readable by signed-in users)
- `users/{uid}/private/account`: `email` (owner only)
- `conversations/{minUid_maxUid}`: `participants, participantNames, createdAt, updatedAt, lastMessageText, lastSenderId`
- `conversations/{id}/messages/{messageId}`: `conversationId, senderId, text, createdAt`

## Limitations
- Not end-to-end encrypted. Messages are readable by the Firebase project owner.
- Only the newest 200 messages per conversation are loaded.
- User search is a case-insensitive prefix match on display name; names are not unique.
- Display names in conversations are copied at creation and are not updated if a name changes later.
- Only email/password sign-in is implemented. Phone auth would need an additional sign-in function that calls `ensureProfile`.
- Must be served over http(s); opening `index.html` via `file://` will not load ES modules.
