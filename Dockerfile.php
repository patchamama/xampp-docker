ARG PHP_BASE_IMAGE=php:8.4-apache
FROM ${PHP_BASE_IMAGE}

# System dependencies
RUN apt-get update && apt-get install -y \
    libpng-dev libjpeg-dev libwebp-dev libfreetype6-dev \
    libzip-dev libcurl4-openssl-dev libxml2-dev libonig-dev \
    libmagickwand-dev libintl-perl \
    python3 python3-dev python3-pip python3-venv \
    git curl unzip wget nano vim mariadb-client \
    && rm -rf /var/lib/apt/lists/*

# Python symlink
RUN ln -sf /usr/bin/python3 /usr/bin/python

# PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql mysqli mbstring gd zip curl opcache intl soap xml bcmath \
    && pecl install imagick \
    && docker-php-ext-enable imagick opcache

# Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pm2 nodemon yarn typescript \
    && rm -rf /var/lib/apt/lists/*

# Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# WP-CLI
RUN curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x /usr/local/bin/wp

# Drush (Drupal CLI) via Composer
RUN composer global require drush/drush \
    && ln -sf /root/.composer/vendor/bin/drush /usr/local/bin/drush

# Apache modules
RUN a2enmod rewrite ssl headers proxy proxy_http proxy_fcgi dav dav_fs deflate expires

# SSL directory
RUN mkdir -p /etc/ssl/xampp

WORKDIR /var/www/html

EXPOSE 80 443
