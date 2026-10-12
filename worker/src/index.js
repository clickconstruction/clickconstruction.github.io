import { EmailMessage } from "cloudflare:email";

const LIMITS = { name: 100, company: 120, phone: 40, email: 254, message: 3000, choice: 60, city: 80 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, cors);
    }
    if (origin && !allowedOrigins(env).includes(origin)) {
      return json({ ok: false, error: "Origin not allowed" }, 403, cors);
    }

    const contentType = request.headers.get("Content-Type") || "";
    const isForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
    let fields;
    try {
      if (isForm) {
        const formData = await request.formData();
        fields = Object.fromEntries(formData);
        fields.open = formData.getAll("open");
      } else {
        fields = await request.json();
      }
    } catch {
      return json({ ok: false, error: "Could not read the submission" }, 400, cors);
    }

    // Honeypot: bots fill the hidden "website" field. Pretend it worked.
    if (clean(fields.website, 200)) {
      return isForm ? redirectHome(env) : json({ ok: true }, 200, cors);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json({ ok: false, error: "Too many requests. Please wait a minute and try again." }, 429, cors);
      }
    }

    if (env.TURNSTILE_SECRET) {
      const token = clean(fields["cf-turnstile-response"], 2048);
      if (!(await verifyTurnstile(token, ip, env.TURNSTILE_SECRET))) {
        return json({ ok: false, error: "Verification failed. Please try again." }, 400, cors);
      }
    }

    const name = clean(fields.name, LIMITS.name);
    const company = clean(fields.company, LIMITS.company);
    const phone = clean(fields.phone, LIMITS.phone);
    const email = clean(fields.email, LIMITS.email);
    const message = cleanMultiline(fields.message, LIMITS.message);
    const open = (Array.isArray(fields.open) ? fields.open : [fields.open])
      .map((v) => clean(v, LIMITS.choice)).filter(Boolean).slice(0, 10);
    const projectType = clean(fields.project_type, LIMITS.choice);
    const stage = clean(fields.stage, LIMITS.choice);
    const city = clean(fields.city, LIMITS.city);
    const role = clean(fields.role, LIMITS.choice);

    if (name.length < 2) {
      return json({ ok: false, error: "Please tell us your name." }, 400, cors);
    }
    if (!phone && !email) {
      return json({ ok: false, error: "Please include a phone number or an email address." }, 400, cors);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "That email address doesn't look right." }, 400, cors);
    }

    const raw = buildMessage({ name, company, phone, email, message, open, projectType, stage, city, role, ip, env });
    try {
      await env.CONTACT_EMAIL.send(new EmailMessage(env.FROM_ADDRESS, env.TO_ADDRESS, raw));
    } catch (err) {
      console.error("send failed", err);
      return json({ ok: false, error: "We couldn't send your message. Please call us instead." }, 502, cors);
    }

    return isForm ? redirectHome(env) : json({ ok: true }, 200, cors);
  },
};

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin, env) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function redirectHome(env) {
  return Response.redirect(`${env.SITE_ORIGIN}/?sent=1#contact`, 303);
}

// Single-line field: strip control characters so nothing can inject a header.
function clean(value, max) {
  return String(value ?? "").replace(/[\r\n\t\0]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim().slice(0, max);
}

async function verifyTurnstile(token, ip, secret) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  body.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

function buildMessage({ name, company, phone, email, message, open, projectType, stage, city, role, ip, env }) {
  const job = [projectType, stage, city].filter(Boolean).join(", ");
  const lines = [
    `Name:     ${name}`,
    `Company:  ${company || "(not given)"}`,
    `Phone:    ${phone || "(not given)"}`,
    `Email:    ${email || "(not given)"}`,
    "",
    `Waiting on:  ${open.length ? open.join(", ") : "(nothing picked)"}`,
    `Job:         ${job || "(not given)"}`,
    `Their role:  ${role || "(not given)"}`,
    "",
    "The question that's been open longest:",
    message || "(none)",
    "",
    "----",
    `Sent from the clickconstruction.com contact form on ${new Date().toUTCString()} (IP ${ip}).`,
  ];
  const headers = [
    `From: "Click Construction Website" <${env.FROM_ADDRESS}>`,
    `To: <${env.TO_ADDRESS}>`,
    `Subject: ${encodeHeader(`Open question: ${job || "new inquiry"} (${name})`)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${env.FROM_ADDRESS.split("@")[1]}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  if (email) headers.push(`Reply-To: ${encodeHeader(name)} <${email}>`);
  return headers.join("\r\n") + "\r\n\r\n" + base64Wrap(lines.join("\n")) + "\r\n";
}

function encodeHeader(text) {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64(text)}?=`;
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64Wrap(text) {
  return base64(text).replace(/(.{76})/g, "$1\r\n");
}
