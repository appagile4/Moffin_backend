const {
  getKolkataDate,
  finalizeMonthlyCycle,
  getOrCreateMonthlyRecord
} = require('../services/tierCalculationService');
const Vendor = require('../models/vendorModel');

let schedulerInterval = null;
let lastClosedMonthKey = null;

/**
 * Execute monthly reset and finalization cycle
 * Safe against duplicate execution, server restarts, and multi-instances
 */
const runMonthlyResetJob = async (manualYear = null, manualMonth = null) => {
  try {
    const nowKolkata = getKolkataDate();
    let targetYear = manualYear;
    let targetMonth = manualMonth;

    if (!targetYear || !targetMonth) {
      // Finalize previous month
      if (nowKolkata.month === 1) {
        targetYear = nowKolkata.year - 1;
        targetMonth = 12;
      } else {
        targetYear = nowKolkata.year;
        targetMonth = nowKolkata.month - 1;
      }
    }

    const monthKey = `${targetYear}-${targetMonth}`;
    console.log(`⏳ [MonthlyTierResetJob] Starting monthly finalization for ${monthKey} (Asia/Kolkata)...`);

    // 1. Finalize and create immutable snapshot for the completed month
    const result = await finalizeMonthlyCycle(targetYear, targetMonth);
    console.log(`✅ [MonthlyTierResetJob] Finalized ${result.monthLabel}: ${result.closedCount} vendors closed, total volume: ₹${result.totalCycleVolume.toLocaleString('en-IN')}`);

    // 2. Initialize current month fresh for all active vendors (totalTopUp = 0)
    const activeVendors = await Vendor.find({ isActive: true });
    for (const vendor of activeVendors) {
      await getOrCreateMonthlyRecord(vendor._id, nowKolkata.year, nowKolkata.month);
    }

    lastClosedMonthKey = monthKey;
    return result;
  } catch (error) {
    console.error(`❌ [MonthlyTierResetJob] Error executing monthly reset: ${error.message}`);
    throw error;
  }
};

/**
 * Start background timer checking for month rollover (00:00 AM IST on 1st of month)
 */
const startMonthlyTierScheduler = () => {
  if (schedulerInterval) return;

  // Check every 60 seconds
  schedulerInterval = setInterval(async () => {
    const nowKolkata = getKolkataDate();
    // Trigger on the 1st of the month at midnight hour
    if (nowKolkata.day === 1 && nowKolkata.hour === 0) {
      let prevYear = nowKolkata.year;
      let prevMonth = nowKolkata.month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const monthKey = `${prevYear}-${prevMonth}`;
      if (lastClosedMonthKey !== monthKey) {
        await runMonthlyResetJob(prevYear, prevMonth);
      }
    }
  }, 60000);

  console.log('⏰ Monthly Tier Reset Scheduler registered (Timezone: Asia/Kolkata).');
};

const stopMonthlyTierScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

module.exports = {
  runMonthlyResetJob,
  startMonthlyTierScheduler,
  stopMonthlyTierScheduler
};
