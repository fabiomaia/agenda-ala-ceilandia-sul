#!/usr/bin/env python3
"""Monta index.html (base.html + app.js) e gera vercel.json com os cabeçalhos
de segurança. A Content-Security-Policy libera só os scripts embutidos das
páginas (pela impressão digital SHA-256 de cada um), então rode este script
sempre que mudar qualquer <script> das páginas."""
import base64, hashlib, json, os, re

AQUI = os.path.dirname(os.path.abspath(__file__))
SUPABASE = "oawfulvhjuqybnqmeqmi.supabase.co"
SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js"
PAGINAS = ["index.html", "publico/index.html", "privacidade.html"]


def ler(p):
    with open(os.path.join(AQUI, p), encoding="utf-8") as f:
        return f.read()


def montar_index():
    html = ler("base.html") + ler("app.js")
    with open(os.path.join(AQUI, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def hashes():
    hs = []
    for p in PAGINAS:
        for corpo in re.findall(r"<script>(.*?)</script>", ler(p), flags=re.S):
            d = base64.b64encode(hashlib.sha256(corpo.encode("utf-8")).digest()).decode()
            hs.append(f"'sha256-{d}'")
    return sorted(set(hs))


def csp():
    return "; ".join([
        "default-src 'self'",
        "script-src 'self' " + SUPABASE_JS + " " + " ".join(hashes()),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        f"connect-src 'self' https://{SUPABASE} wss://{SUPABASE} " + SUPABASE_JS,
        "manifest-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])


def gerar_vercel():
    cfg = {"rewrites": [
        {"source": "/agenda.ics", "destination": "/api/agenda"},
        {"source": "/agenda/:org.ics", "destination": "/api/agenda?org=:org"},
    ], "headers": [{"source": "/(.*)", "headers": [
        {"key": "Content-Security-Policy", "value": csp()},
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
        {"key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups"},
    ]}]}
    with open(os.path.join(AQUI, "vercel.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    montar_index()
    gerar_vercel()
    print("index.html e vercel.json gerados;", len(hashes()), "scripts embutidos liberados")
