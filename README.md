# Eventique: full-stack event vendor booking app

Eventique lets customers find and book wedding and event vendors, lets vendors manage bookings and payouts, and gives admins a console to run the platform. This repository has three parts:

| Folder | What it is | Tech |
|---|---|---|
| `server/` | REST API, realtime events, database models, seed data | Node.js 18+, Express, MongoDB (Mongoose), Socket.IO, Razorpay, JWT |
| `web/` | The Eventique web app (all screens), served by the server | HTML/CSS/JS + `api.js` that talks to the server |
| `mobile/` | Android and iOS app | React Native with Expo |

```
Browser (web/)  ─┐                      ┌─ MongoDB (users, vendors, bookings, payments, chat, planner…)
                 ├─ HTTPS /api + WebSocket ─┤
Phone (mobile/) ─┘     server/          ├─ Razorpay (payments, refunds)       [test mode by default]
                                        ├─ MSG91 / Twilio (OTP SMS)          [dev mode by default]
                                        └─ Local disk or Cloudinary (images)
```

---

## 1. Run the server and web app

**You need:** Node.js 18 or newer, and MongoDB (install MongoDB Community locally, or create a free cluster on MongoDB Atlas).

```bash
cd server
cp .env.example .env        # then open .env and set MONGO_URI and JWT_SECRET
npm install
npm run seed                # fills the database with demo vendors, bookings and users (wipes existing data)
npm run dev                 # starts http://localhost:4000
```

Open **http://localhost:4000** in your browser. A small green "Live server" badge at the bottom means the web app is using the real backend.

Generate a JWT secret with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Demo logins (after `npm run seed`)

| Role | Mobile number | OTP |
|---|---|---|
| Customer (Priya Sharma) | 9876543210 | 123456 |
| Vendor (Lumière Studios) | 9123456780 | 123456 |
| Admin (Kavya) | 9000000001 | 123456 |

New numbers can sign up. In development (`OTP_PROVIDER=dev`) the OTP is printed in the server terminal and shown on screen.

### Run the tests
```bash
cd server
npm test
```
Tests cover pricing and GST, advance and payout maths, OTP hashing, Razorpay payment and webhook signatures, booking status rules and refund rules.

---

## 2. Test mode vs real mode

Everything runs in **test mode** out of the box, so you can demo the full flow with no accounts or keys.

| Feature | Test mode (default) | Real mode: what to set in `server/.env` |
|---|---|---|
| OTP SMS | No Twilio keys: no SMS; code is printed and shown on screen | **Twilio Verify (recommended):** set `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_VERIFY_SID` (with `OTP_PROVIDER=auto`). Or plain Twilio SMS with `TWILIO_FROM`, or `OTP_PROVIDER=msg91` + `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`. Demo numbers in `DEMO_PHONES` keep OTP 123456; clear it for full production. |
| Payments | Razorpay keys empty: built-in mock gateway, a "Test payment" screen, no money moves | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (start with **Test Mode** keys from the Razorpay dashboard, then switch to Live keys after KYC). Add `RAZORPAY_WEBHOOK_SECRET` and a webhook for `payment.captured` pointing to `<PUBLIC_URL>/api/payments/webhook`. |
| Images | `STORAGE=local`: saved in `server/uploads/` | `STORAGE=cloudinary` + `CLOUDINARY_URL=cloudinary://key:secret@cloud` |
| 22-language switcher (web) | Off | `ANTHROPIC_API_KEY` (optional) |

Never put secret keys in the web or mobile code, or send them in chat. They only go in `server/.env`, which is git-ignored.

**Payouts to vendors:** the admin "Record payout" button marks a payout as paid with a reference. Moving money to vendor bank accounts automatically needs RazorpayX, which is not wired in yet.

---

## 3. Run the mobile app

**You need:** the server running (step 1), and the **Expo Go** app on your phone (Play Store / App Store).

```bash
cd mobile
npm install
```

Set the server address. On a real phone, `localhost` means the phone itself, so use your computer's Wi-Fi IP address. On Windows, run `ipconfig`; on macOS/Linux, run `ifconfig`. The phone and the computer must be on the same Wi-Fi.

Either edit `mobile/app.json` → `"extra": { "apiUrl": "http://192.168.1.10:4000" }`, or run:
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 npx expo start
```
Then scan the QR code with Expo Go (Android) or the Camera app (iOS).

Also add your phone's origin to `CORS_ORIGINS` if you use Expo web.

**Build an installable Android APK:**
```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Mobile screens: guided tour with Evora's voice, OTP login and sign-up, and the dashboards for each role.

- **Customer:** home with events and top vendors, vendor search and detail, booking with a date picker, Razorpay checkout, bookings with timeline, balance payment and review, planner (checklist, budget, guests), chat with vendors, Evora assistant, notifications, profile with photo upload, saved vendors.
- **Vendor:** dashboard stats, accept/decline/complete requests, packages, portfolio upload, business profile and documents, payments, chat.
- **Admin:** overview with GMV chart, vendor verification, bookings, users (block/unblock), complaints, refunds and payouts, broadcast.

---

## 4. Deploy (free tiers are enough for a demo)

**Fastest way, Render Blueprint (about 10 minutes):**

1. **Database:** on mongodb.com/atlas, create a free M0 cluster. Add a database user, allow network access from `0.0.0.0/0`, and copy the connection string (put `/eventique` before the `?`).
2. **Code:** push this whole folder to a GitHub repository.
3. **Render:** on render.com, choose **New → Blueprint**, pick the repository, and paste your `MONGO_URI` when asked. `render.yaml` sets everything else, including the build, health check, a generated `JWT_SECRET` and demo OTP mode.
4. Open `https://eventique.onrender.com` (or whatever name Render gives). On the first start the server fills the empty database with the demo data automatically (`AUTO_SEED=true`), so the demo logins work straight away.

Notes: the free Render plan sleeps after 15 minutes idle, so the first visit takes about a minute. Uploaded photos on local disk are lost on redeploy, so set `STORAGE=cloudinary` for permanent images.

**Manual setup (Render, Railway or any Node host):** root directory `server`, build `npm install`, start `npm start`. Set the `.env` values in the host's dashboard with `NODE_ENV=production`, and either set `AUTO_SEED=true` or run `npm run seed -- --force` once.
4. **Mobile:** set `apiUrl` to your HTTPS server URL and rebuild with EAS.
5. **Razorpay:** add the webhook URL from step 2.

---

## 5. API reference

All endpoints are under `/api`. Send `Authorization: Bearer <token>` after login.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/otp` · `POST /auth/verify` |
| Me | `GET/PATCH /me` · `POST /me/photo` · `POST /me/phone/otp` · `POST /me/phone/verify` · `GET /me/favs` · `POST /me/favs/:vendorId` · `GET/POST /me/cards` · `DELETE /me/cards/:id` |
| Catalogue | `GET /catalog` · `GET /vendors?q&category&city&event&sort&page` · `GET /vendors/:id` |
| Vendor self-service | `GET/PATCH /vendor/me` · `PUT /vendor/me/packages` · `POST /vendor/me/portfolio` · `DELETE /vendor/me/portfolio/:i` · `POST /vendor/me/documents` · `PUT /vendor/me/blocked-dates` · `GET /vendor/me/stats` |
| Bookings | `POST /bookings` · `GET /bookings` · `GET /bookings/:id` · `PATCH /bookings/:id/status` · `POST /bookings/:id/pay-advance` · `POST /bookings/:id/pay-balance` · `POST /bookings/:id/review` |
| Payments | `POST /payments/verify` · `POST /payments/mock-complete` (test mode only) · `POST /payments/webhook` · `GET /payments` |
| Planner | `GET /planner` · `POST/PATCH/DELETE /planner/tasks` · `POST/DELETE /planner/expenses` · `POST/PATCH/DELETE /planner/guests` · `POST /planner/guests/mark-invited` |
| Chat | `GET/POST /threads` · `GET/POST /threads/:id/messages` |
| Reviews | `GET /vendor/reviews` · `POST /reviews/:id/reply` · `POST /reviews/:id/flag` |
| Notifications | `GET /notifications` · `POST /notifications/read-all` · `POST /notifications/:id/read` |
| Complaints | `POST /complaints` |
| Admin | `GET /admin/overview` · `GET/PATCH /admin/users` · `GET/PATCH /admin/vendors` · `GET/POST/PATCH /admin/categories` · `POST /admin/payments/:id/process` · `GET/PATCH /admin/reviews` · `GET/PATCH /admin/complaints` · `GET/POST /admin/broadcasts` · `GET/PUT /admin/settings` |
| Other | `GET /health` · `POST /translate` |

Realtime (Socket.IO, authenticated with the same token):
- `notification`: new in-app notification.
- `booking`: a booking status changed.
- `message`: new chat message.
- `activity`: admin live feed.

### Booking lifecycle
`AwaitingPayment` → (advance paid) → `Pending` → vendor **Confirmed** / **Declined** → **Completed** → review.

- The customer can cancel while the booking is AwaitingPayment or Pending.
- An admin can cancel at any stage before completion.
- Refunds are created automatically:
  - Declined, or cancelled before the vendor confirms: full advance.
  - Cancelled after the vendor confirms: full refund within the free-cancellation window, otherwise none.
  - Cancelled by an admin: always a full refund.
- When a booking is completed, a vendor payout is created: the amount paid minus the platform commission.

### Database collections
`users` · `otps` (hashed, auto-expire) · `categories` · `eventtypes` · `vendors` (packages, portfolio, documents, blocked dates) · `bookings` (status history) · `payments` (advance, balance, refund, payout) · `reviews` · `threads` · `messages` · `notifications` · `complaints` · `broadcasts` · `tasks` · `expenses` · `guests` · `cards` · `settings`.

---

## 6. Security notes
- OTPs are stored only as HMAC hashes. They expire after 5 minutes, allow 5 attempts, and have a 30-second resend limit. Auth routes are rate-limited.
- Payments are confirmed only after the server verifies Razorpay's signature. Amounts are always calculated on the server, never taken from the app.
- Every booking, chat and planner request checks that it belongs to the logged-in user, and role checks guard the vendor and admin routes.
- Uploads accept only JPG, PNG, WEBP and PDF files, up to 8 MB.
- In production, set a strong `JWT_SECRET`, turn off dev OTP, clear `DEMO_PHONES`, and serve over HTTPS.

## 7. What was verified while building
- **Server:** all files pass a syntax check. The 11 unit tests pass. The app module loads with every internal import resolved.
- **Web app:** tested in a real browser against a mock of this API. Customer login, data loading, booking, test payment and checklist all worked, and vendor and admin login with all their data loaded. Vendor approval was also checked.
- **Mobile app:** every file compiles and bundles with all imports resolved.
- **Not run yet:** the server against a real MongoDB, real Razorpay/MSG91/Twilio calls, and the mobile app on a device. The build machine had no internet access. Run steps 1 and 3 on your computer to try them.
