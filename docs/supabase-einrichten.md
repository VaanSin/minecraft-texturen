# Online-Konten einrichten (Supabase) – einmalig, ca. 10 Minuten

Damit man sich in „Minecraft Texturen“ mit **Benutzername und Passwort** anmelden kann und Themen
online gespeichert und geteilt werden, braucht das Programm einen Online-Speicher. Dafür nehmen wir
**Supabase** (kostenlos). Das Konto dort legst du selbst an.

## 1. Konto und Projekt anlegen
1. Auf **supabase.com** → „Start your project“ → anmelden (z. B. mit deinem GitHub-Konto).
2. **New project**:
   - Name: `minecraft-texturen`
   - Database Password: selbst ausdenken und **für dich behalten** (brauche ich nicht)
   - Region: **Central EU (Frankfurt)**
   - „Create new project“ → kurz warten, bis es fertig ist.

## 2. Anmeldung ohne E-Mail-Bestätigung erlauben
Im Projekt links **Authentication** → **Sign In / Providers** (oder „Providers“) → **Email**:
- „Enable Email provider“: **an**
- „Confirm email“: **aus** (sonst müsste man echte E-Mails bestätigen – wir nutzen nur Benutzernamen)
- Speichern.

## 3. Tabellen anlegen
Links **SQL Editor** → „New query“ → den kompletten Inhalt der Datei
`docs\supabase.sql` hineinkopieren → **Run**. Es sollte „Success“ kommen.

## 4. Mir die zwei Angaben schicken
Links **Project Settings** (Zahnrad) → **API Keys** bzw. **Data API**:
- **Project URL** – sieht aus wie `https://abcdefgh.supabase.co`
- **Publishable key** (beginnt mit `sb_publishable_…`) **oder** den **anon public** Key

Diese beiden sind **öffentlich** gedacht (sie stehen später im Programm) und dürfen in den Chat.

**Niemals** schicken: den `service_role`- bzw. **Secret key** und dein **Database Password**.
