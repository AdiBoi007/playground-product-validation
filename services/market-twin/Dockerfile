FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY services/market-twin/package.json services/market-twin/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir /data && chown pwuser:pwuser /data
COPY --chown=pwuser:pwuser services/market-twin/src ./src
COPY --chown=pwuser:pwuser src/mvp/twin.ts /src/mvp/twin.ts
ENV NODE_ENV=production TWIN_HOST=0.0.0.0 TWIN_PORT=8787 TWIN_DATA_DIR=/data
USER pwuser
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "const p=process.env.PORT||process.env.TWIN_PORT||'8787';fetch('http://127.0.0.1:'+p+'/health',{headers:{Authorization:'Bearer '+process.env.TWIN_WORKER_SECRET}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.mjs"]
