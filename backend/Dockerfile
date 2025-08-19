FROM node:14 as build-deps

# Atualizar e instalar dependências básicas
RUN apt-get update && apt-get install -y wget gnupg

# Copiar requirements.txt (que está na raiz junto do docker-compose.yml)
COPY ../requirements.txt /tmp/requirements.txt

# Instalar todas as libs listadas no requirements.txt
RUN apt-get update && \
    xargs -a /tmp/requirements.txt apt-get install -y && \
    rm -rf /var/lib/apt/lists/*

# Instalar Dockerize
ENV DOCKERIZE_VERSION v0.6.1
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz

# Instalar Google Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
      fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar dumb-init
ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.1/dumb-init_1.2.1_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

# Diretório de trabalho
WORKDIR /usr/src/app

# Instalar dependências Node
COPY package*.json ./
RUN npm install

# Copiar código e compilar
COPY . .
RUN npm run build

# Variáveis
ENV NODE_ENV=production
ENV PORT=3000
ENV CHROME_BIN=google-chrome-stable

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD dockerize -wait tcp://${DB_HOST}:3306 \
  && npx sequelize db:migrate \
  && node dist/server.js
