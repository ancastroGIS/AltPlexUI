# Dockerfile
# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- serve stage ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
# PLEX_SERVER_URL is required at runtime; the nginx image substitutes it into
# the template via envsubst before starting.
EXPOSE 80
