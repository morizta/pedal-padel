# ── Build stage ──────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install dependency (manfaatkan cache layer: salin manifest dulu)
COPY package.json package-lock.json* ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
RUN npm install

# Salin sumber & build (Vite inline env saat build → butuh build args)
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build --workspace=@pedal/web

# ── Serve stage ──────────────────────────────────────────────────────
FROM nginx:alpine AS serve
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
