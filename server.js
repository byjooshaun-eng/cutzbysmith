require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const NOTIFICATION_EMAIL = "sxrgebusiness@gmail.com";
const db = new Database(process.env.DB_PATH || path.join(__dirname, "bookings.db"));

function createMailer() {
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: process.env.SMTP_SERVICE || "gmail",
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

async function sendBookingNotification(booking) {
  const mailer = createMailer();
  if (!mailer) {
    throw new Error("SMTP_USER and SMTP_PASS are not configured in the server process.");
  }

  const details = [
    ["Booking reference", `BK-${booking.id}`],
    ["Full name", booking.name],
    ["Contact number", booking.phone],
    ["Email address", booking.email],
    ["Main service", booking.service || "Not specified", booking.servicePrice ? `TT$${booking.servicePrice}` : ""],
    ["Additional services", booking.addOns || "None", booking.addOnPrices || ""],
    ["Appointment date", booking.date],
    ["Appointment time", booking.time]
  ];
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
  const detailsHtml = details.map(([label, value, secondary]) => `
    <tr>
      <td style="padding:10px 0;color:#aeb7c0;font-size:13px;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;color:#ffffff;font-size:14px;text-align:right;font-weight:700;">${escapeHtml(value)}${secondary ? `<br><span style="color:#d71920;font-size:13px;">${escapeHtml(secondary)}</span>` : ""}</td>
    </tr>`).join("");
  const emailHtml = (heading, intro) => `
    <!doctype html>
    <html lang="en">
      <body style="margin:0;background:#f4f4f4;color:#0d0d0d;font-family:Arial,Helvetica,sans-serif;">
        <div style="padding:32px 16px;">
          <div style="max-width:600px;margin:0 auto;background:#0d0d0d;border-top:5px solid #d71920;">
            <div style="padding:28px 32px;background:#000;color:#ffffff;">
              <div style="font-size:24px;font-weight:700;letter-spacing:1px;">CutzBySmith<span style="color:#d71920;">.</span></div>
            </div>
            <div style="padding:32px;background:#0d0d0d;color:#ffffff;">
              <div style="color:#d71920;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(heading)}</div>
              <h1 style="margin:12px 0 10px;color:#ffffff;font-size:30px;line-height:1.1;">${escapeHtml(intro)}</h1>
              <p style="margin:0 0 24px;color:#bdbdbd;font-size:15px;line-height:1.6;">Here are the appointment details:</p>
              <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #333;border-bottom:1px solid #333;">${detailsHtml}</table>
            </div>
            <div style="padding:20px 32px;background:#000;color:#888;font-size:12px;line-height:1.5;">Clean cuts. Quality service.</div>
          </div>
        </div>
      </body>
    </html>`;

  await mailer.verify();
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER.trim(),
    to: booking.email,
    subject: "Your appointment is confirmed | CutzBySmith",
    html: emailHtml("Appointment confirmed", `You're booked, ${booking.name}.`),
    text: [
      "Your appointment has been confirmed.",
      "",
      `Booking reference: BK-${booking.id}`,
      `Full Name: ${booking.name}`,
      `Contact Number: ${booking.phone}`,
      `Email: ${booking.email}`,
      `Main service: ${booking.service || "Not specified"}${booking.servicePrice ? ` (TT$${booking.servicePrice})` : ""}`,
      `Additional services: ${booking.addOns || "None"}${booking.addOnPrices ? ` (${booking.addOnPrices})` : ""}`,
      `Appointment Date: ${booking.date}`,
      `Appointment Time: ${booking.time}`
    ].join("\n")
  });

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER.trim(),
    to: NOTIFICATION_EMAIL,
    subject: `New appointment booked: ${booking.name}`,
    html: emailHtml("New appointment", `${booking.name} has booked an appointment.`),
    text: [
      "A new appointment has just been made.",
      "",
      `Booking reference: BK-${booking.id}`,
      `Full Name: ${booking.name}`,
      `Contact Number: ${booking.phone}`,
      `Email: ${booking.email}`,
      `Main service: ${booking.service || "Not specified"}${booking.servicePrice ? ` (TT$${booking.servicePrice})` : ""}`,
      `Additional services: ${booking.addOns || "None"}${booking.addOnPrices ? ` (${booking.addOnPrices})` : ""}`,
      `Address: ${booking.address || "Not provided"}`,
      `Appointment Date: ${booking.date}`,
      `Appointment Time: ${booking.time}`
    ].join("\n")
  });

  return true;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    service TEXT NOT NULL DEFAULT '',
    add_ons TEXT NOT NULL DEFAULT '',
    booking_date TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(booking_date, booking_time)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    experience TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const bookingColumns = db.prepare("PRAGMA table_info(bookings)").all();
if (!bookingColumns.some(column => column.name === "email")) {
  db.exec("ALTER TABLE bookings ADD COLUMN email TEXT NOT NULL DEFAULT ''");
}
if (!bookingColumns.some(column => column.name === "service")) {
  db.exec("ALTER TABLE bookings ADD COLUMN service TEXT NOT NULL DEFAULT ''");
}
if (!bookingColumns.some(column => column.name === "add_ons")) {
  db.exec("ALTER TABLE bookings ADD COLUMN add_ons TEXT NOT NULL DEFAULT ''");
}

const reviewColumns = db.prepare("PRAGMA table_info(reviews)").all();
if (!reviewColumns.some(column => column.name === "rating")) {
  db.exec("ALTER TABLE reviews ADD COLUMN rating INTEGER NOT NULL DEFAULT 5");
}

const SETTINGS = {
  openingHour: 9,
  closingHour: 17,
  slotMinutes: 30,
  daysClosed: [0] // Sunday
};

const SERVICES = {
  haircut: "Haircut",
  "big-chop": "Big Chop"
};
const ADD_ONS = {
  "beard-mustache": "Beard & Mustache",
  "trim-down": "Trim Down / Cut Down"
};
const SERVICE_PRICES = {
  haircut: 100,
  "big-chop": 140
};
const ADD_ON_PRICES = {
  "beard-mustache": 20,
  "trim-down": 20
};

function validDate(dateString) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateString) &&
    !Number.isNaN(new Date(`${dateString}T00:00:00`).getTime());
}

function isBusinessDay(dateString) {
  const day = new Date(`${dateString}T00:00:00`).getDay();
  return !SETTINGS.daysClosed.includes(day);
}

function generateSlots() {
  const slots = [];
  for (let minutes = SETTINGS.openingHour * 60;
       minutes < SETTINGS.closingHour * 60;
       minutes += SETTINGS.slotMinutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    slots.push(`${h}:${m}`);
  }
  return slots;
}

function validateBooking(body) {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const service = String(body.service || "").trim();
  const addOns = Array.isArray(body.addOns) ? body.addOns : [];
  const address = String(body.address || "").trim();
  const date = String(body.date || "").trim();
  const time = String(body.time || "").trim();

  if (!name || name.length > 100) return "Please enter a valid name.";
  if (!phone || phone.length > 30) return "Please enter a valid contact number.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "Please enter a valid email address.";
  if (service && !SERVICES[service]) return "Please choose a valid main service.";
  if (addOns.some(addOn => !ADD_ONS[addOn])) return "Please choose valid additional services.";
  if (address.length > 250) return "Address is too long.";
  if (!validDate(date)) return "Please choose a valid date.";
  if (!isBusinessDay(date)) return "That day is unavailable.";
  if (!generateSlots().includes(time)) return "That time is unavailable.";

  // Do not allow bookings in the past.
  const requested = new Date(`${date}T${time}:00`);
  if (requested <= new Date()) return "Please choose a future date and time.";

  return null;
}

app.get("/api/availability", (req, res) => {
  const date = String(req.query.date || "").trim();

  if (!validDate(date)) {
    return res.status(400).json({ error: "Invalid date." });
  }

  if (!isBusinessDay(date)) {
    return res.json({ date, slots: [], closed: true });
  }

  const booked = db.prepare(`
    SELECT booking_time
    FROM bookings
    WHERE booking_date = ?
  `).all(date).map(row => row.booking_time);

  const slots = generateSlots().map(time => ({
    time,
    available: !booked.includes(time)
  }));

  res.json({ date, slots, closed: false });
});

app.post("/api/bookings", async (req, res) => {
  const error = validateBooking(req.body);
  if (error) return res.status(400).json({ error });

  const name = String(req.body.name).trim();
  const phone = String(req.body.phone).trim();
  const email = String(req.body.email).trim();
  const service = String(req.body.service || "").trim();
  const addOns = Array.isArray(req.body.addOns) ? req.body.addOns.filter(addOn => ADD_ONS[addOn]) : [];
  const address = String(req.body.address || "").trim();
  const date = String(req.body.date).trim();
  const time = String(req.body.time).trim();

  try {
    const insert = db.prepare(`
      INSERT INTO bookings
        (name, phone, email, address, service, add_ons, booking_date, booking_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(name, phone, email, address, service, addOns.join(","), date, time);

    res.status(201).json({
      success: true,
      bookingId: result.lastInsertRowid,
      emailQueued: true,
      message: "Your appointment has been booked successfully."
    });

    sendBookingNotification({
      id: result.lastInsertRowid,
      name,
      phone,
      email,
      service: SERVICES[service] || "",
      servicePrice: SERVICE_PRICES[service] || 0,
      addOns: addOns.map(addOn => ADD_ONS[addOn]).join(", ") || "None",
      addOnPrices: addOns.map(addOn => `+TT$${ADD_ON_PRICES[addOn]}`).join(", "),
      address,
      date,
      time
    }).catch(emailError => {
      console.error("Booking saved, but notification email failed:", emailError.message);
    });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({
        error: "Sorry, that time was just booked by someone else. Please choose another slot."
      });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.get("/api/reviews", (req, res) => {
  const reviews = db.prepare(`
    SELECT id, name, experience, rating, created_at
    FROM reviews
    ORDER BY id DESC
    LIMIT 6
  `).all();

  res.json(reviews);
});

app.post("/api/reviews", (req, res) => {
  const name = String(req.body.name || "").trim();
  const experience = String(req.body.experience || "").trim();
  const rating = Number(req.body.rating);

  if (!name || name.length > 100) {
    return res.status(400).json({ error: "Please enter a valid name." });
  }
  if (!experience || experience.length > 2000) {
    return res.status(400).json({ error: "Please enter a review under 2,000 characters." });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Please choose a rating from 1 to 5 stars." });
  }

  try {
    const result = db.prepare(`
      INSERT INTO reviews (name, experience, rating)
      VALUES (?, ?, ?)
    `).run(name, experience, rating);

    res.status(201).json({ success: true, reviewId: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Booking website running at http://localhost:${PORT}`);
});