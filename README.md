# Bar Master — guía rápida

## 1. Supabase
1. Crea un proyecto en https://supabase.com.
2. SQL Editor → pega `schema.sql` → Run.
3. Authentication → Providers → Email: para pruebas, desactiva "Confirm email".
4. Project Settings → API: copia **Project URL** y la clave **anon** en `config.js`.

## 2. Probar en local
Abre la carpeta en VS Code con la extensión *Live Server* → "Go Live". Regístrate con tu correo.

## 3. Hazte master
En SQL Editor, ejecuta (con tu correo):
`update profiles set role = 'master' where id = (select id from auth.users where email = 'tu@correo.com');`
Recarga la app: verás Tickets y Catálogo. Los demás usuarios serán clientes.

## 4. GitHub Pages
1. Sube la carpeta a un repo de GitHub (`git init`, `git add .`, `git commit`, `git push`).
2. Repo → Settings → Pages → Branch `main` / root → Save.
3. En Supabase → Authentication → URL Configuration, agrega la URL de tu página en "Site URL".

La clave anon es pública; los permisos los controlan las políticas RLS de `schema.sql`.
