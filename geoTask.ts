// app/geoTask.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const ROUTE_TASK = 'ROUTE_TRACK_TASK';

function keyFor(date = new Date()) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `route:${y}-${m}-${d}`;
}

TaskManager.defineTask(ROUTE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Route task error:', error);
    return;
  }
  const locations = (data as any)?.locations as LocationObject[] | undefined;
  if (!locations?.length) return;

  const k = keyFor(); // 今日のキー
  const prev = (await AsyncStorage.getItem(k)) || '[]';
  const arr = JSON.parse(prev) as any[];

  for (const loc of locations) {
    arr.push({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      timestamp: loc.timestamp ?? Date.now(),
    });
  }
  await AsyncStorage.setItem(k, JSON.stringify(arr));

  // “今日”以外は削除（1日保持）
  const allKeys = await AsyncStorage.getAllKeys();
  const toDelete = allKeys.filter((kk) => kk.startsWith('route:') && kk !== k);
  if (toDelete.length) await AsyncStorage.multiRemove(toDelete);
});
