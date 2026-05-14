FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip tar git mariadb-client \
    php-cli php-mysql php-xml php-mbstring php-curl php-zip php-intl \
    && rm -rf /var/lib/apt/lists/*

# Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# WP-CLI
RUN curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x /usr/local/bin/wp

# Drush (Drupal CLI)
RUN composer global require drush/drush \
    && ln -sf /root/.composer/vendor/bin/drush /usr/local/bin/drush

COPY package.json ./
RUN npm install --production

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
