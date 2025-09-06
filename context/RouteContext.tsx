// context/RouteContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ROUTE_TASK } from '../geoTask';

type RoutePoint = { latitude: number; longitude: number; timestamp: number };

type RouteCtx = {
  points: RoutePoint[];
  isTracking: boolean;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  reloadToday: () => Promise<void>;
  clearToday: () => Promise<void>;
};

const Ctx = createContext<RouteCtx | undefined>(undefined);

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `route:${y}-${m}-${dd}`;
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // 明日0:00
  return next.getTime() - now.getTime();
}

export function RouteProvider({ children }: { children: ReactNode }) {
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const midnightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadToday = async () => {
    const raw = (await AsyncStorage.getItem(todayKey())) || '[]';
    setPoints(JSON.parse(raw));
  };

  const startTracking = async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') throw new Error('位置情報の許可（使用中）が必要です');

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') throw new Error('位置情報の許可（常に）が必要です');

    const started = await Location.hasStartedLocationUpdatesAsync(ROUTE_TASK);
    if (!started) {
      await Location.startLocationUpdatesAsync(ROUTE_TASK, {
        accuracy: Location.Accuracy.Balanced, // 電池と精度のバランス
        timeInterval: 60 * 1000,              // 1分間隔目安
        distanceInterval: 20,                 // 20m移動で更新
        pausesUpdatesAutomatically: true,
        showsBackgroundLocationIndicator: true, // iOS: 背景位置情報インジケータ
        foregroundService: {                   // Android: 常駐通知
          notificationTitle: 'ルート記録中',
          notificationBody: '今日の移動を記録しています',
        },
      });
    }
    setIsTracking(true);
  };

  const stopTracking = async () => {
    const started = await Location.hasStartedLocationUpdatesAsync(ROUTE_TASK);
    if (started) await Location.stopLocationUpdatesAsync(ROUTE_TASK);
    setIsTracking(false);
  };

  const clearToday = async () => {
    await AsyncStorage.removeItem(todayKey());
    setPoints([]);
  };

  // 0時に“今日のログを削除”するタイマーを張る
  const scheduleMidnightReset = () => {
    if (midnightTimer.current) clearTimeout(midnightTimer.current);
    midnightTimer.current = setTimeout(async () => {
      await clearToday();     // 今日分を削除
      await reloadToday();    // UI更新
      scheduleMidnightReset(); // 次の0時も仕込む
    }, msUntilNextMidnight());
  };

  useEffect(() => {
    // 起動時：許可を取り、常時記録を開始 / 状態同期
    (async () => {
      try {
        // 許可要求（最初の一回ここでまとめて）
        const fg = await Location.requestForegroundPermissionsAsync();
        const bg = await Location.requestBackgroundPermissionsAsync();

        if (fg.status === 'granted' && bg.status === 'granted') {
          // すでに開始済みか確認し、未開始なら開始
          const started = await Location.hasStartedLocationUpdatesAsync(ROUTE_TASK);
          if (!started) {
            await Location.startLocationUpdatesAsync(ROUTE_TASK, {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 60 * 1000,
              distanceInterval: 20,
              pausesUpdatesAutomatically: true,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: 'ルート記録中',
                notificationBody: '今日の移動を記録しています',
              },
            });
          }
          setIsTracking(true);
        } else {
          setIsTracking(false);
        }
      } catch (e) {
        // 許可拒否等
        setIsTracking(false);
      } finally {
        await reloadToday();
        scheduleMidnightReset();
      }
    })();

    return () => {
      if (midnightTimer.current) clearTimeout(midnightTimer.current);
    };
  }, []);

  // 15秒ごとにUIへ反映（バックグラウンド追記 → 反映用）
  useEffect(() => {
    const t = setInterval(reloadToday, 15 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <Ctx.Provider
      value={{ points, isTracking, startTracking, stopTracking, reloadToday, clearToday }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRouteTrack() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRouteTrack must be used within RouteProvider');
  return v;
}
