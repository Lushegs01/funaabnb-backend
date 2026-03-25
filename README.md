# FunSpace Backend API 🎓

> Node.js + Express + MongoDB REST API for the FunSpace student housing platform (FUNAAB).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT (access + refresh tokens) |
| Image uploads | Cloudinary + Multer |
| Payments | Paystack |
| Email | Nodemailer (Gmail / Brevo) |
| Deployment | Railway / Render |

---

## Project Structure

```
funspace-backend/
├── config/
│   └── db.js                  # MongoDB connection
├── controllers/
│   ├── authController.js      # Register, login, profile, password reset
│   ├── listingController.js   # Listing CRUD, search, moderation
│   ├── bookingController.js   # Booking lifecycle + Paystack payments
│   └── reviewController.js    # Reviews & ratings
├── middleware/
│   ├── auth.js                # JWT protect + role restriction
│   ├── errorHandler.js        # Global error handler
│   └── upload.js              # Multer + Cloudinary
├── models/
│   ├── User.js
│   ├── Listing.js
│   ├── Booking.js
│   └── Review.js
├── routes/
│   ├── authRoutes.js
│   ├── listingRoutes.js
│   ├── bookingRoutes.js
│   └── reviewRoutes.js
├── utils/
│   ├── email.js               # Nodemailer email templates
│   └── paystack.js            # Paystack helpers
├── .env.example
├── .gitignore
├── package.json
└── server.js                  # Entry point
```

---

## Quick Start

### 1. Clone & install
```bash
git clone https://github.com/yourusername/funspace-backend.git
cd funspace-backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in all values in .env
```

### 3. Run in development
```bash
npm run dev
```

Server starts at `http://localhost:5000`

---

## Environment Variables

See `.env.example` for all required variables.

**Required services to set up:**
- **MongoDB Atlas** — free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
- **Cloudinary** — free tier at [cloudinary.com](https://cloudinary.com)
- **Paystack** — test keys at [paystack.com](https://paystack.com)
- **Gmail** — create an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

---

## API Reference

Base URL: `http://localhost:5000/api`

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Register new user |
| POST | `/auth/login` | ❌ | Login, returns tokens |
| GET | `/auth/verify-email/:token` | ❌ | Verify email address |
| POST | `/auth/refresh-token` | ❌ | Get new access token |
| POST | `/auth/forgot-password` | ❌ | Send reset email |
| PATCH | `/auth/reset-password/:token` | ❌ | Reset password |
| GET | `/auth/me` | ✅ | Get current user |
| PATCH | `/auth/update-profile` | ✅ | Update profile + avatar |
| PATCH | `/auth/change-password` | ✅ | Change password |
| POST | `/auth/save-listing/:listingId` | ✅ | Toggle save listing |

### Listings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/listings` | ❌ | Get all listings (filterable) |
| GET | `/listings/featured` | ❌ | Get featured listings |
| GET | `/listings/:id` | ❌ | Get single listing |
| POST | `/listings` | ✅ landlord | Create listing (+ photos) |
| GET | `/listings/my/listings` | ✅ landlord | Get my listings |
| PATCH | `/listings/:id` | ✅ owner | Update listing |
| DELETE | `/listings/:id` | ✅ owner | Delete listing |
| DELETE | `/listings/:id/images` | ✅ owner | Remove a photo |
| PATCH | `/listings/:id/moderate` | ✅ admin | Approve/reject listing |

**Query params for GET /listings:**
```
?type=selfcon&minPrice=50000&maxPrice=200000&area=Alabata&amenities=wifi,water&available=true&search=cozy&page=1&limit=12&sort=-price
```

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/bookings` | ✅ student | Create booking request |
| GET | `/bookings/my` | ✅ | Get my bookings |
| GET | `/bookings/incoming` | ✅ landlord | Get incoming requests |
| GET | `/bookings/:id` | ✅ | Get single booking |
| PATCH | `/bookings/:id/confirm` | ✅ landlord | Confirm booking |
| PATCH | `/bookings/:id/reject` | ✅ landlord | Reject booking |
| DELETE | `/bookings/:id/cancel` | ✅ tenant | Cancel booking |
| POST | `/bookings/:id/pay` | ✅ tenant | Initialize Paystack payment |
| GET | `/bookings/verify/:reference` | ✅ | Verify payment after redirect |

### Reviews

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/reviews/listing/:listingId` | ❌ | Get reviews for a listing |
| POST | `/reviews` | ✅ tenant | Leave a review (requires paid booking) |
| PATCH | `/reviews/:id/reply` | ✅ landlord | Landlord reply to review |
| DELETE | `/reviews/:id` | ✅ | Delete review |

---

## Payment Flow (Paystack)

```
1. Landlord confirms booking
2. Tenant calls POST /bookings/:id/pay
   → Returns { paymentUrl, reference }
3. Redirect tenant to paymentUrl (Paystack hosted page)
4. Paystack redirects to CLIENT_URL/payment/verify?ref=REFERENCE
5. Frontend calls GET /bookings/verify/:reference
   → Verifies with Paystack, marks booking as paid
   → Sends payment receipt email
   → Marks listing as unavailable
```

---

## Deploying to Railway

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard (copy from `.env`)
4. Add a MongoDB plugin **or** use your Atlas URI
5. Railway auto-detects `npm start` from `package.json`
6. Your API will be live at `https://your-app.railway.app`

### Deploying to Render

1. Go to [render.com](https://render.com) → New Web Service
2. Connect GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables
6. Done ✅

---

## Connecting to the Frontend

Update `API_BASE_URL` in your frontend HTML:
```javascript
const API_BASE_URL = 'https://your-api.railway.app/api';
```

All requests need the Authorization header for protected routes:
```javascript
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
}
```

---

## User Types & Permissions

| Action | student | landlord / agent | admin |
|--------|---------|-----------------|-------|
| Browse listings | ✅ | ✅ | ✅ |
| Create booking | ✅ | ❌ | ✅ |
| Create listing | ❌ | ✅ | ✅ |
| Confirm/reject booking | ❌ | ✅ | ✅ |
| Approve listing | ❌ | ❌ | ✅ |
| Delete any listing | ❌ | ❌ | ✅ |
