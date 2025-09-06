import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Dimensions, FlatList, Image, PanResponder,
  Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { supabase } from '../lib/supabase';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MIN = 148;
const SHEET_MAX = Math.floor(SCREEN_H * 0.74);
const SHEET_DEFAULT = Math.floor(SHEET_MIN + (SHEET_MAX - SHEET_MIN) * 0.72);

const FAB_SIZE = 72;
const FAB_BG = '#FF2EDA';
const BOTTOM_BAR = '#FFBED5';
const SHEET_BG = '#FEF3F7';
const PILL_BG = '#E5C2FF';
const PILL_ACTIVE = '#FF6EF5';
const SIDE_ICON_SIZE = 64;

const MAP_STYLE = [
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#fff9f9" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#ccd4d7" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#d0fcd1" }] },
  { featureType: "road", elementType: "all", stylers: [{ hue: "#ff0000" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fed9e7" }, { visibility: "on" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#74dbff" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#e6b9c9" }, { saturation: -20 }, { lightness: 10 }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#fff9f9" }, { lightness: 20 }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "simplified" }, { lightness: 30 }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9ac4a3" }, { lightness: 10 }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#f6fff6" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#c9c1c1" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#c9c1c1" }] },
];

type Post = {
  id: string;
  created_at: string;
  image_url?: string | null;
  category?: string | null;
  owner_id?: string;
  userName?: string;
  avatarUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type TrackPoint = { lat: number; lng: number; ts: number };

const DEFAULT_TAGS = ['カジュアル', 'スマート', 'フェミニン', 'モード', 'アウトドア'];
const ENCOUNTER_RADIUS_M = 50;          // ← すれ違い半径（m）
const MAX_TRACK_POINTS = 800;           // メモリ保護：軌跡点の最大数
const WATCH_DISTANCE_M = 10;            // 位置更新の閾値（m）
const WATCH_INTERVAL_MS = 10000;        // 位置更新の最短間隔
const MIN_PING_INTERVAL = 60_000;       // pings へは60秒に1回だけ保存

/* ---------- いいね Hook ---------- */
function useLike(postId: string, userId: string | null) {
  const [liked, setLiked] = useState(false);
  const check = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();
    setLiked(!!data);
  }, [userId, postId]);
  useEffect(() => { check(); }, [check]);

  const toggle = useCallback(async () => {
    if (!userId) return;
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', postId);
      setLiked(false);
    } else {
      await supabase.from('likes').insert({ user_id: userId, post_id: postId });
      setLiked(true);
    }
  }, [liked, userId, postId]);
  return { liked, toggle };
}

/* ---------- カード ---------- */
function PostCard({ item, userId }: { item: Post; userId: string | null }) {
  const { liked, toggle } = useLike(item.id, userId);
  const uri = item.image_url ?? undefined;
  const [aspect, setAspect] = useState(3 / 4);
  useEffect(() => {
    if (!uri) return;
    Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setAspect(w / h); }, () => {});
  }, [uri]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder} />}
        <Text style={styles.userName}>{item.userName ?? 'ユーザー'}</Text>
        {item.category ? <Text style={styles.pillMini}>{item.category}</Text> : null}
      </View>
      <View style={styles.imageBox}>
        {uri ? (
          <Image source={{ uri }} style={[styles.imageDynamic, { aspectRatio: aspect }]} />
        ) : (
          <View style={[styles.imageDynamic, styles.imagePlaceholder, { aspectRatio: aspect }]} />
        )}
        {/* 左下ハート（タップで赤） */}
        <TouchableOpacity style={styles.heartBtnBL} onPress={toggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? '#FF2D55' : '#222'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- ユーティリティ ---------- */
function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `track:${y}-${m}-${d}`;
}
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HomeScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [candidates, setCandidates] = useState<Post[]>([]); // 今日の“他者”の全投稿（座標あり）
  const [encountered, setEncountered] = useState<Post[]>([]); // すれ違い済み（50m以内に入った）

  // タグまわり（任意）
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 位置情報許諾 & 現在地
  const [hasLocPerm, setHasLocPerm] = useState(false);
  const [initialRegion, setInitialRegion] = useState({
    latitude: 35.681236, longitude: 139.767125, latitudeDelta: 0.01, longitudeDelta: 0.01,
  });

  /* ---------- 認証ユーザー ---------- */
  useEffect(() => { (async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  })(); }, []);

  /* ---------- 今日の軌跡を復元 ---------- */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(todayKey());
        if (raw) {
          const arr: TrackPoint[] = JSON.parse(raw);
          setTrack(Array.isArray(arr) ? arr : []);
        }
      } catch {}
    })();
  }, []);

  /* ---------- 現在地の取得 & 監視開始（＋pings保存） ---------- */
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPingAtRef = useRef(0);
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setHasLocPerm(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setInitialRegion(r => ({ ...r, latitude, longitude }));

      // 監視
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: WATCH_INTERVAL_MS,
          distanceInterval: WATCH_DISTANCE_M,
        },
        async (pos) => {
          const { latitude: la, longitude: ln } = pos.coords;
          setTrack(prev => {
            const next = [...prev, { lat: la, lng: ln, ts: Date.now() }].slice(-MAX_TRACK_POINTS);
            AsyncStorage.setItem(todayKey(), JSON.stringify(next)).catch(()=>{});
            return next;
          });

          // ← pings に60秒に1回だけ保存
          if (userId) {
            const now = Date.now();
            if (now - lastPingAtRef.current > MIN_PING_INTERVAL) {
              await supabase.from('pings').insert({
                user_id: userId,
                lat: la,
                lng: ln,
              });
              lastPingAtRef.current = now;
            }
          }
        }
      );
    })();
    return () => { watchRef.current?.remove(); };
  }, [userId]);

  /* ---------- 今日の“他者”候補投稿を取得（座標ありのみ） ---------- */
  const fetchTodayCandidates = useCallback(async (uid: string | null) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);

    const { data, error } = await supabase
      .from('posts')
      .select(`
        id, created_at, image_url, category, owner_id, lat, lng,
        profiles:owner_id ( username, avatar_url )
      `)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());

    if (error || !data) { setCandidates([]); return; }

    const mapped: Post[] = (data as any[])
      .filter(p => p.lat && p.lng && (!uid || p.owner_id !== uid)) // 座標あり & 自分以外
      .map(r => ({
        id: String(r.id),
        created_at: r.created_at,
        image_url: r.image_url,
        category: r.category,
        owner_id: r.owner_id,
        userName: r.profiles?.username ?? 'ユーザー',
        avatarUrl: r.profiles?.avatar_url ?? null,
        lat: r.lat,
        lng: r.lng,
      }));

    setCandidates(mapped);
  }, []);

  useEffect(() => { fetchTodayCandidates(userId); }, [fetchTodayCandidates, userId]);

  /* ---------- すれ違い判定：軌跡の任意点から50m以内 ---------- */
  const recomputeEncountered = useCallback(() => {
    if (track.length === 0 || candidates.length === 0) { setEncountered([]); return; }
    // ざっくり間引き（高速化）
    const sample = track.filter((_, i) => i % 2 === 0); // 2点に1点
    const res = candidates.filter(p => {
      const plat = p.lat!, plng = p.lng!;
      for (const t of sample) {
        if (haversineM(t.lat, t.lng, plat, plng) <= ENCOUNTER_RADIUS_M) return true;
      }
      return false;
    });
    setEncountered(res);
  }, [track, candidates]);

  useEffect(() => { recomputeEncountered(); }, [recomputeEncountered]);

  /* ---------- Bottom Sheet ---------- */
  const sheetHeight = useRef(new Animated.Value(SHEET_DEFAULT)).current;
  const progress = sheetHeight.interpolate({ inputRange: [SHEET_MIN, SHEET_MAX], outputRange: [0, 1], extrapolate: 'clamp' });
  const mapScale = progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0.92], extrapolate: 'clamp' });
  const overlayOpacity = progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 0, 0.15], extrapolate: 'clamp' });

  const sheetPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderMove: (_, g) => {
      const next = (sheetHeight as any)._value + -g.dy;
      if (next >= SHEET_MIN && next <= SHEET_MAX) sheetHeight.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const cur = (sheetHeight as any)._value;
      const target = cur - SHEET_MIN > (SHEET_MAX - SHEET_MIN) / 2 || g.vy < -0.5 ? SHEET_MAX : SHEET_MIN;
      Animated.spring(sheetHeight, { toValue: target, useNativeDriver: false, bounciness: 4, speed: 12 }).start();
    },
  }), []);

  const mapPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (_, g) => Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 6,
    onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 6,
    onPanResponderMove: (_, g) => {
      const next = (sheetHeight as any)._value + -g.dy;
      if (next >= SHEET_MIN && next <= SHEET_MAX) sheetHeight.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const cur = (sheetHeight as any)._value;
      const target = cur - SHEET_MIN > (SHEET_MAX - SHEET_MIN) / 2 || g.vy < -0.5 ? SHEET_MAX : SHEET_MIN;
      Animated.spring(sheetHeight, { toValue: target, useNativeDriver: false, bounciness: 4, speed: 12 }).start();
    },
  }), []);

  /* ---------- タグ / 並べ替え（任意） ---------- */
  const TAGS = useMemo(() => {
    const from = Array.from(new Set(candidates.map(p => p.category).filter(Boolean))) as string[];
    const merged = [...from]; for (const t of DEFAULT_TAGS) if (!merged.includes(t)) merged.push(t);
    return merged.slice(0, 5);
  }, [candidates]);

  const sortedPosts = useMemo(() => {
    const base = [...encountered].sort((a,b)=> +new Date(b.created_at) - +new Date(a.created_at));
    if (!selectedTag) return base;
    const key = (p:Post)=> p.category===selectedTag ? 0 : 1;
    return base.sort((a,b)=> key(a)-key(b));
  }, [encountered, selectedTag]);

  const listRef = useRef<FlatList<Post>>(null);
  const onSelectTag = (tag: string) => { setSelectedTag(cur => cur === tag ? null : tag); listRef.current?.scrollToOffset({ offset: 0, animated: true }); };
  const onPressHeader = () =>
    Animated.spring(sheetHeight, { toValue: (sheetHeight as any)._value === SHEET_MAX ? SHEET_MIN : SHEET_MAX, useNativeDriver: false, bounciness: 4, speed: 12 }).start();

  const renderEmpty = () => (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
        今日はまだ投稿を見つけていません。ぜひ外を歩いてみましょう！
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* マップ */}
      <Animated.View style={[styles.mapWrap, { transform: [{ scale: mapScale }] }]}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          customMapStyle={MAP_STYLE}
          showsUserLocation={hasLocPerm}
          followsUserLocation={Platform.OS === 'ios'}
          showsMyLocationButton={Platform.OS === 'android'}
          initialRegion={initialRegion}
        >
          {/* ▼ 移動軌跡（今日） */}
          {track.length >= 2 && (
            <Polyline
              coordinates={track.map(p => ({ latitude: p.lat, longitude: p.lng }))}
              strokeWidth={4}
              strokeColor="#8A2BE2"
            />
          )}

          {/* ▼ すれ違い投稿のピン（メイン画像を丸く） */}
          {encountered.map(p => (p.lat && p.lng ? (
            <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }}>
              <View style={styles.pinWrap}>
                <Image
                  source={{ uri: p.image_url ?? '' }}
                  style={styles.pinImage}
                />
                <View style={styles.pinTip} />
              </View>
            </Marker>
          ) : null))}
        </MapView>
        <View style={StyleSheet.absoluteFill} {...mapPanResponder.panHandlers} />
        <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: overlayOpacity }]} />
      </Animated.View>

      {/* ▼ 今日あった投稿集（遭遇済みのみ） */}
      <Animated.View style={[styles.sheet, { height: sheetHeight, top: Animated.subtract(SCREEN_H, sheetHeight) }]}{...sheetPanResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.9} onPress={onPressHeader}>
          <View style={styles.sheetHeader}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>今日あった投稿集</Text>
          </View>
        </TouchableOpacity>

        <FlatList
          ref={listRef}
          data={sortedPosts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard item={item} userId={userId} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.tagHeader}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRowScroll}>
                {TAGS.map(tag => {
                  const selected = selectedTag === tag;
                  return (
                    <TouchableOpacity key={tag} onPress={() => onSelectTag(tag)} style={[styles.pill, selected && styles.pillActive]}>
                      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={renderEmpty()}
          stickyHeaderIndices={[0]}
        />
      </Animated.View>

      {/* 下帯（既存のまま） */}
      <View pointerEvents="box-none" style={styles.fabWrap}>
        <View pointerEvents="none" style={styles.bottomBar} />
        <TouchableOpacity style={styles.leftHalf} onPress={() => router.push('/likes')}>
          <Ionicons name="heart-outline" size={SIDE_ICON_SIZE} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.rightHalf} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={SIDE_ICON_SIZE} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/camera')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.plus}>＋</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const PIN_SIZE = 48;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },

  sheet: {
    position: 'absolute', left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    backgroundColor: SHEET_BG,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, zIndex: 10,
  },
  sheetHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  grabber: { width: 52, height: 6, borderRadius: 3, backgroundColor: '#cfa9e8', marginBottom: 6 },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#7a3a86' },

  tagHeader: { backgroundColor: SHEET_BG },
  tagRowScroll: { paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row' },

  // ▼ 下帯に隠れないように大きめ余白
  listContent: { paddingHorizontal: 16, paddingBottom: 180 },

  card: { borderRadius: 18, backgroundColor: '#fff', marginTop: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ddd' },
  avatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#d9d9d9' },
  userName: { marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#333' },
  pillMini: { marginLeft: 'auto', backgroundColor: PILL_BG, color: '#6d3e79', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', fontSize: 11 },

  imageBox: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#f2f2f2', marginTop: 6, position: 'relative' },
  imageDynamic: { width: '100%', backgroundColor: '#eee' },
  imagePlaceholder: { backgroundColor: '#dcdcdc' },

  heartBtnBL: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },

  // ▼ ピン（丸画像＋小さな三角）
  pinWrap: {
    alignItems: 'center',
  },
  pinImage: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#eee',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -1,
  },

  // 下帯
  fabWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, elevation: 30 },
  bottomBar: { height: 96, backgroundColor: BOTTOM_BAR, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  leftHalf: { position: 'absolute', left: 0, bottom: 0, width: '50%', height: 96, justifyContent: 'center', alignItems: 'center' },
  rightHalf:{ position: 'absolute', right: 0, bottom: 0, width: '50%', height: 96, justifyContent: 'center', alignItems: 'center' },

  fab: {
    position: 'absolute', left: '50%', transform: [{ translateX: -FAB_SIZE / 2 }],
    bottom: 32, width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    backgroundColor: FAB_BG, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
    ...Platform.select({ android: { elevation: 12 } }),
  },
  plus: { color: '#fff', fontSize: 40, lineHeight: 44, fontWeight: '800' },

  pill: { backgroundColor: PILL_BG, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  pillActive: { backgroundColor: PILL_ACTIVE },
  pillText: { fontSize: 12, fontWeight: '600', color: '#6d3e79' },
  pillTextActive: { color: '#7a3a86' },
});
