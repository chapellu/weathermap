<template>
  <header class="navbar">
    <div class="navbar-inner">
      <span class="navbar-logo">⛅ WeatherApp</span>
      <div class="navbar-right">
        <span class="plan-badge" :class="user.plan">{{ user.plan }}</span>
        <span v-if="user.role === 'admin'" class="role-badge">admin</span>
        <span class="user-email">{{ user.email }}</span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const user = computed(() => auth.user!)
</script>

<style scoped>
.navbar {
  background: #1a56db;
  color: #fff;
  padding: 0 1.5rem;
  height: 56px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.navbar-inner {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.navbar-logo {
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-email {
  font-size: 0.875rem;
  opacity: 0.85;
}

.plan-badge, .role-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 999px;
}

.plan-badge.free {
  background: rgba(255,255,255,0.2);
  color: #fff;
}

.plan-badge.pro {
  background: #f6ad55;
  color: #7b341e;
}

.role-badge {
  background: #fc8181;
  color: #742a2a;
}
</style>
