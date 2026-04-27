<template>
  <main class="home">
    <div class="container">
      <form class="search-form" @submit.prevent="search">
        <input
          v-model="city"
          class="search-input"
          type="text"
          placeholder="Search for a city..."
          autocomplete="off"
        />
        <button class="search-btn" type="submit" :disabled="loading">
          {{ loading ? '...' : 'Search' }}
        </button>
      </form>

      <div v-if="error" class="error-box">
        {{ error }}
      </div>

      <template v-if="weather">
        <WeatherCard :weather="weather" />

        <div v-if="canForecast" class="forecast-section">
          <button
            v-if="!forecast && !forecastLoading"
            class="forecast-btn"
            @click="loadForecast"
          >
            View 5-Day Forecast
          </button>
          <div v-if="forecastLoading" class="forecast-loading">Loading forecast...</div>
          <div v-if="forecastError" class="error-box">{{ forecastError }}</div>
          <ForecastCard v-if="forecast" :forecast="forecast" />
        </div>

        <div v-else class="upgrade-hint">
          <span>Upgrade to <strong>Pro</strong> to unlock the 5-day forecast and global city access.</span>
          <button class="upgrade-btn" @click="upgradePlan">Upgrade to Pro</button>
        </div>
      </template>

      <div v-if="!weather && !loading && !error" class="empty-state">
        <span class="empty-icon">🌍</span>
        <p>Enter a city name to get the current weather.</p>
        <p v-if="auth.user?.plan === 'free'" class="free-hint">
          Free plan: Europe only · 10 requests/day
        </p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, type Forecast, type Weather } from '../api'
import ForecastCard from '../components/ForecastCard.vue'
import WeatherCard from '../components/WeatherCard.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const city = ref('')
const loading = ref(false)
const error = ref('')
const weather = ref<Weather | null>(null)

const forecast = ref<Forecast | null>(null)
const forecastLoading = ref(false)
const forecastError = ref('')

const canForecast = computed(
  () => auth.user?.plan === 'pro' || auth.user?.role === 'admin',
)

async function search() {
  if (!city.value.trim()) return
  loading.value = true
  error.value = ''
  weather.value = null
  forecast.value = null
  forecastError.value = ''
  try {
    weather.value = await api.getWeather(city.value.trim())
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}

async function loadForecast() {
  if (!weather.value) return
  forecastLoading.value = true
  forecastError.value = ''
  try {
    forecast.value = await api.getForecast(weather.value.city)
  } catch (e) {
    forecastError.value = e instanceof Error ? e.message : 'Could not load forecast'
  } finally {
    forecastLoading.value = false
  }
}

async function upgradePlan() {
  try {
    await fetch('/me/plan', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    })
    await auth.fetchUser()
  } catch {
    // ignore
  }
}
</script>

<style scoped>
.home {
  padding: 2rem 1rem;
  min-height: calc(100vh - 56px);
}

.container {
  max-width: 700px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.search-form {
  display: flex;
  gap: 0.75rem;
}

.search-input {
  flex: 1;
  padding: 0.85rem 1.25rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1rem;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input:focus {
  border-color: #1a56db;
  box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.12);
}

.search-btn {
  padding: 0.85rem 1.75rem;
  background: #1a56db;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.search-btn:hover:not(:disabled) {
  background: #1e429f;
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-box {
  background: #fff5f5;
  color: #c53030;
  border: 1px solid #fed7d7;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  font-size: 0.9rem;
}

.forecast-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.forecast-btn {
  width: 100%;
  padding: 0.85rem;
  background: #fff;
  color: #1a56db;
  border: 1.5px solid #1a56db;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.forecast-btn:hover {
  background: #ebf4ff;
}

.forecast-loading {
  text-align: center;
  color: #718096;
  padding: 1rem;
}

.upgrade-hint {
  background: #fff;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  font-size: 0.9rem;
  color: #4a5568;
}

.upgrade-btn {
  padding: 0.5rem 1.25rem;
  background: #f6ad55;
  color: #7b341e;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.upgrade-btn:hover {
  background: #ed8936;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #718096;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.empty-icon {
  font-size: 3rem;
}

.free-hint {
  font-size: 0.8rem;
  color: #a0aec0;
}
</style>
