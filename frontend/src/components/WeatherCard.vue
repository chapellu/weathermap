<template>
  <div class="weather-card">
    <div class="weather-header">
      <div>
        <h2 class="city">{{ weather.city }}, {{ weather.country }}</h2>
        <p class="description">{{ weather.description }}</p>
      </div>
      <span class="weather-icon">{{ icon }}</span>
    </div>
    <div class="weather-temp">{{ Math.round(weather.temp) }}°C</div>
    <div class="weather-details">
      <div class="detail">
        <span class="detail-label">Feels like</span>
        <span class="detail-value">{{ Math.round(weather.feels_like) }}°C</span>
      </div>
      <div class="detail">
        <span class="detail-label">Humidity</span>
        <span class="detail-value">{{ weather.humidity }}%</span>
      </div>
      <div class="detail">
        <span class="detail-label">Wind</span>
        <span class="detail-value">{{ weather.wind_speed }} m/s</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { weatherIcon, type Weather } from '../api'

const props = defineProps<{ weather: Weather }>()
const icon = computed(() => weatherIcon(props.weather.description))
</script>

<style scoped>
.weather-card {
  background: linear-gradient(135deg, #1a56db 0%, #1e429f 100%);
  color: #fff;
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(26, 86, 219, 0.3);
}

.weather-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.city {
  font-size: 1.5rem;
  font-weight: 700;
}

.description {
  font-size: 0.95rem;
  opacity: 0.85;
  text-transform: capitalize;
  margin-top: 0.25rem;
}

.weather-icon {
  font-size: 3.5rem;
  line-height: 1;
}

.weather-temp {
  font-size: 4rem;
  font-weight: 800;
  letter-spacing: -2px;
  margin-bottom: 1.5rem;
}

.weather-details {
  display: flex;
  gap: 1.5rem;
  border-top: 1px solid rgba(255,255,255,0.2);
  padding-top: 1rem;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-label {
  font-size: 0.75rem;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 1rem;
  font-weight: 600;
}
</style>
