FROM searxng/searxng:latest

COPY searxng-settings.yml /etc/searxng/settings.yml

ENV SEARXNG_PORT=8080 \
    SEARXNG_BIND_ADDRESS=0.0.0.0 \
    SEARXNG_URL=http://localhost:8080/

EXPOSE 8080
