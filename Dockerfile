# The office as a container. Nothing in here listens on a port. The image exists
# so a nightly job can run the same commands the operators run, with the day's
# extracts mounted in at /desk.
FROM node:20.18.2-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /opt/garnerbin

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bin ./bin
COPY src ./src
COPY examples ./examples

RUN ln -s /opt/garnerbin/bin/garnerbin.js /usr/local/bin/garnerbin \
    && chmod +x /opt/garnerbin/bin/garnerbin.js

USER node
WORKDIR /desk

ENTRYPOINT ["garnerbin"]
CMD ["--help"]
