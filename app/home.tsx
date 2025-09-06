// app/home.tsx
import { Image as ExpoImage } from 'expo-image';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Platform,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const gearIcon = require('../assets/images/haguruma.png');

type Post = { id: string; image_url: string | null; created_at: string; owner_id: string; category: string | null; };
type Profile = { id: string; username: string | null; avatar_url: string | null; bio: string | null; };

const BG = '#FEF3F7';
const PILL = '#E5C2FF';

/** 公開URLから storage 内の相対パス（avatars/ 以降）を抜き出す */
function toAvatarsPath(url: string | null) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/avatars/';
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

/** アバター専用ローダー：公開URLが失敗したら署名URLに自動フォールバック */
function Avatar({ publicUrl }: { publicUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [triedSigned, setTriedSigned] = useState(false);

  // 毎回キャッシュ破棄パラメータを付与
  const busted = useMemo(
    () => (publicUrl ? `${publicUrl}?v=${Date.now()}` : null),
    [publicUrl]
  );

  useEffect(() => {
    setUrl(busted);
    setTriedSigned(false);
  }, [busted]);

  const handleError = useCallback(async () => {
    console.log('[avatar] public fetch failed → try signed');
    if (triedSigned) return; // 署名URLでも失敗したら諦めてプレースホルダ
    setTriedSigned(true);
    const rel = toAvatarsPath(publicUrl);
    if (!rel) return;
    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUrl(rel, 60 * 60 * 24 * 365); // 1年
    if (error) {
      console.log('[avatar] createSignedUrl error:', error.message);
      return;
    }
    setUrl(data?.signedUrl ?? null);
  }, [publicUrl, triedSigned]);

  if (!url) return <View style={[styles.avatar, styles.avatarPlaceholder]} />;

  return (
    <ExpoImage
      key={url}                   // URLが変わると必ず再描画
      source={{ uri: url }}
      style={styles.avatar}
      contentFit="cover"
      cachePolicy="none"
      onError={(err) => { console.log('[avatar] onError', err); handleError(); }}
    />
  );
}

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fmt = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };

  const fetchAuth = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  }, []);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, bio')
      .eq('id', uid)
      .maybeSingle();
    if (!error) setProfile((data as Profile) ?? null);
  }, []);

  const fetchMyPosts = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('posts')
      .select('id,image_url,created_at,owner_id,category')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });
    if (!error && data) setPosts(data as Post[]);
    else Alert.alert('取得エラー', '投稿一覧を取得できませんでした');
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await Promise.all([fetchProfile(userId), fetchMyPosts(userId)]);
    setLoading(false);
  }, [userId, fetchProfile, fetchMyPosts]);

  useEffect(() => { fetchAuth(); }, [fetchAuth]);
  useFocusEffect(React.useCallback(() => { if (userId) refresh(); }, [userId, refresh]));

  const goSettings = () => router.push('/settings');
  const goEditProfile = () => router.push('/profile');
  const goLikes = () => router.push('/likes');

  const CardLink: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
    <Link href={{ pathname: '/posts/[id]', params: { id } }} asChild>
      <TouchableOpacity style={styles.postCard} activeOpacity={0.86}
        onPress={() => router.push({ pathname: '/posts/[id]', params: { id } })}>
        {children}
      </TouchableOpacity>
    </Link>
  );

  const Header = () => (
    <View style={styles.headerArea} pointerEvents="box-none">
      <TouchableOpacity style={styles.gearBtn} onPress={goSettings}>
        <Image source={gearIcon} style={styles.gearImg} />
      </TouchableOpacity>

      <View style={styles.titleRow}>
        <Avatar publicUrl={profile?.avatar_url ?? null} />
        <Text style={styles.userName}>{profile?.username ?? 'ユーザー'}</Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity onPress={goEditProfile} style={styles.editPill}>
          <Text style={styles.editPillText}>プロフィールを編集</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goLikes} style={styles.heartWrap}>
          <Text style={styles.heart}>♡</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: Post }) => {
    const uri = item.image_url ?? undefined;
    return (
      <View style={styles.postBlock}>
        <Text style={styles.dateLabel}>{fmt(item.created_at)}</Text>
        <CardLink id={item.id}>
          {uri ? <Image source={{ uri }} style={styles.postImage} resizeMode="cover" />
               : <View style={[styles.postImage, styles.imagePlaceholder]} />}
        </CardLink>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        ListHeaderComponent={<Header />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>まだ投稿がありません</Text> : null}
        contentContainerStyle={{ paddingBottom: 28 }}
      />
      {loading && <View style={styles.loadingCover}><ActivityIndicator /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: Platform.select({ ios: 48, android: 32 }) },
  headerArea: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  gearBtn: { position: 'absolute', right: 14, top: 14, padding: 6 },
  gearImg: { width: 26, height: 26, tintColor: '#7b7b7b' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', overflow: 'hidden' },
  avatarPlaceholder: { backgroundColor: '#cfcfcf' },
  userName: { fontSize: 28, fontWeight: '700' },
  actionRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  editPill: { backgroundColor: PILL, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  editPillText: { fontSize: 14, fontWeight: '600' },
  heartWrap: { paddingHorizontal: 6, paddingVertical: 2 },
  heart: { fontSize: 26, color: '#FF2D55' },
  postBlock: { paddingHorizontal: 18, marginTop: 8 },
  dateLabel: { fontSize: 14, marginBottom: 6, fontWeight: '600' },
  postCard: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  postImage: { width: '100%', height: 240 },
  imagePlaceholder: { backgroundColor: '#d9d9d9' },
  empty: { textAlign: 'center', marginTop: 40, color: '#666' },
  loadingCover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
