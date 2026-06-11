export function detectAlerts(data) {
  const { hrvHistory = [], rhrHistory = [], recoveryHistory = [], stressScore = 0, sleepDebt = 0 } = data
  const alerts = []

  // HRV declining 5+ consecutive days
  const last5 = hrvHistory.slice(-5).filter(Boolean)
  if (last5.length >= 5) {
    const allDecline = last5.every((v, i) => i === 0 || v <= last5[i - 1])
    if (allDecline && last5[4] < last5[0] * 0.85) {
      alerts.push({
        id: 'hrv_declining',
        severity: 'warning',
        title: 'HRV Declining 5 Days',
        message: 'Your HRV has dropped consistently. This often precedes illness or overtraining.',
        action: 'Prioritize sleep and cut today\'s intensity.',
        icon: '📉',
      })
    }
  }

  // Recovery below 33% for 3+ consecutive days
  const last3Recovery = recoveryHistory.slice(-3)
  if (last3Recovery.length >= 3 && last3Recovery.every(r => r < 33)) {
    alerts.push({
      id: 'low_recovery',
      severity: 'danger',
      title: 'Red Zone 3 Days Straight',
      message: 'Extended low recovery signals your body is under serious stress.',
      action: 'Take a complete rest day. Review sleep, nutrition, and stress.',
      icon: '🚨',
    })
  }

  // RHR elevated trend
  const last7RHR = rhrHistory.slice(-7).filter(Boolean)
  const first3RHR = rhrHistory.slice(-7, -4).filter(Boolean)
  if (last7RHR.length >= 6 && first3RHR.length >= 3) {
    const recentAvg = last7RHR.slice(-3).reduce((a, b) => a + b, 0) / 3
    const priorAvg = first3RHR.reduce((a, b) => a + b, 0) / first3RHR.length
    if (recentAvg > priorAvg + 5) {
      alerts.push({
        id: 'rhr_elevated',
        severity: 'warning',
        title: 'Resting HR Trending Up',
        message: `Your resting HR is ${Math.round(recentAvg - priorAvg)} bpm above your recent baseline.`,
        action: 'Watch for signs of illness or accumulated fatigue.',
        icon: '💓',
      })
    }
  }

  // Sleep debt over 3 hours this week
  if (sleepDebt >= 3) {
    alerts.push({
      id: 'sleep_debt',
      severity: sleepDebt >= 5 ? 'danger' : 'warning',
      title: `${sleepDebt}h Sleep Debt This Week`,
      message: 'Your body is running a sleep deficit. Cognitive function and recovery are impaired.',
      action: 'Add 30–60 min tonight. Even partial payback helps.',
      icon: '💤',
    })
  }

  // High stress
  if (stressScore > 78) {
    alerts.push({
      id: 'high_stress',
      severity: 'warning',
      title: 'High Physiological Stress',
      message: 'Your HRV and resting HR indicate significant stress on your body right now.',
      action: 'Avoid hard training. Try breathwork or a walk.',
      icon: '⚠️',
    })
  }

  return alerts
}

export function getAlertColor(severity) {
  return severity === 'danger' ? '#ef4444' : '#f59e0b'
}
