export const config = {
  jwt: {
    algorithm: 'HS256',
    expirationTime: '1h',
  },
  cookie: {
    maxAge: 3600, // seconds — must match jwt.expirationTime
  },
  cache: {
    ttlGeo: 24 * 60 * 60, // 24h
    ttlWeather: 10 * 60, // 10min
    ttlForecast: 60 * 60, // 1h
    redisMaxRetries: 1,
  },
  rateLimit: {
    dailyRequestLimit: 10,
  },
  oauth: {
    scopes: ['openid', 'email'],
  },
  owm: {
    units: 'metric',
    lang: 'fr',
  },
  server: {
    port: 3000,
  },
} as const;
