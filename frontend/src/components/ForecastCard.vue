<template>
  <div class="forecast-card">
    <h3 class="forecast-title">5-Day Forecast</h3>
    <div class="forecast-grid">
      <div v-for="day in days" :key="day.dt_txt" class="forecast-day">
        <span class="day-name">{{ formatDay(day.dt_txt) }}</span>
        <span class="day-icon">{{ weatherIcon(day.description) }}</span>
        <span class="day-temp">{{ Math.round(day.temp) }}°C</span>
        <span class="day-desc">{{ day.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { weatherIcon, type Forecast } from '../api'

const props = defineProps<{ forecast: Forecast }>()

const days = computed(() =>
  props.forecast.list
    .filter((item) => item.dt_txt.includes('12:00:00'))
    .slice(0, 5),
)

function formatDay(dtTxt: string): string {
  const date = new Date(dtTxt.replace(' ', 'T') + 'Z')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
</script>

<style scoped>
.forecast-card {
  background: #fff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 2px 16px rgba(0,0,0,0.08);
}

.forecast-title {
  font-size: 1rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 1.25rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.8rem;
}

.forecast-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}

.forecast-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem 0.5rem;
  border-radius: 12px;
  background: #f7fafc;
  text-align: center;
}

.day-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: #4a5568;
}

.day-icon {
  font-size: 1.75rem;
  line-height: 1;
}

.day-temp {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1a202c;
}

.day-desc {
  font-size: 0.65rem;
  color: #718096;
  text-transform: capitalize;
  text-align: center;
  line-height: 1.3;
}
</style>
