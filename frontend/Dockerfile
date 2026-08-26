# 1. Этап сборки приложения
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_OFFLINE_MODE=false
ENV VITE_OFFLINE_MODE=${VITE_OFFLINE_MODE}

# Кэшируем зависимости для ускорения повторных сборок
COPY package*.json ./
RUN npm ci

# Копируем исходный код и собираем статическую папку dist
COPY . .
RUN npm run build

# 2. Этап раздачи статики через Nginx
FROM nginx:stable-alpine
# Копируем собранную папку dist из первого этапа
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
