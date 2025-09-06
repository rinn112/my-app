// lib/pings.ts
import { supabase } from '../lib/supabase';

export async function savePing(lat: number, lng: number) {
  // 30m 以上動いた時 or 30〜60秒おきに呼ぶイメージ
  const { error } = await supabase.from('pings').insert({ lat, lng });
  if (error) {
    console.log('savePing error', error);
  }
}
