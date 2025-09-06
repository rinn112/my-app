// app/likes.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Post = {
  id: string;
  image_url: string | null;
  created_at: string;
  owner_id: string;
  category: string | null;
};

const BG = '#FEF3F7';
const ACCENT = '#FF2EDA'; // 他画面と統一（ピンク系）

export default function LikesScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };

  const fetchAuth = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!error) setUserId(data.user?.id ?? null);
  }, []);

  const fetchLiked = useCallback(async (uid: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('likes')
      .select(`
        created_at,
        posts ( id, image_url, created_at, owner_id, category )
      `)
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      Alert.alert('取得エラー', 'いいね一覧を取得できませんでした');
      setLoading(false);
      return;
    }

    const posts = (data ?? [])
      .map((row: any) => row.posts as Post)
      .filter((p: Post | null) => !!p);
    setLikedPosts(posts);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAuth(); }, [fetchAuth]);
  useEffect(() => { if (userId) fetchLiked(userId); }, [userId, fetchLiked]);

  const openPost = (id: string) => router.push(`/posts/${id}`);

  const unlikeAndRemove = async (postId: string) => {
    if (!userId) return;
    const { error } = await supabase.from('likes').delete()
      .eq('user_id', userId).eq('post_id', postId);
    if (error) {
      console.error(error);
      Alert.alert('エラー', 'いいねを外せませんでした');
      return;
    }
    setLikedPosts(prev => prev.filter(p => p.id !== postId));
  };

  const renderItem = ({ item }: { item: Post }) => {
    const uri = item.image_url ?? undefined;
    return (
      <View style={styles.cardWrap}>
        <Text style={styles.dateLabel}>{formatDate(item.created_at)}</Text>

        <View style={styles.card}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => openPost(item.id)}>
            {uri ? (
              <Image source={{ uri }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]} />
            )}
          </TouchableOpacity>

          {/* ← 他画面と合わせて Ionicons の塗りハート／白丸なし */}
          <TouchableOpacity
            style={styles.likeBtn}
            onPress={() => unlikeAndRemove(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="いいねを外す"
            activeOpacity={0.7}
          >
            <Ionicons name="heart" size={28} color={ACCENT} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>＜</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={likedPosts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 28 }}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>まだ「いいね」した投稿がありません</Text> : null}
        refreshing={loading}
        onRefresh={() => userId && fetchLiked(userId)}
      />

      {loading && <View style={styles.loadingCover}><ActivityIndicator /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: Platform.select({ ios: 48, android: 32 }) },
  header: { paddingHorizontal: 14, marginBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 24, lineHeight: 24, color: ACCENT, fontWeight: '700' },
  cardWrap: { paddingHorizontal: 18, marginTop: 12 },
  dateLabel: { fontSize: 14, marginBottom: 6, fontWeight: '600' },
  card: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', position: 'relative' },
  image: { width: '100%', height: 240 },
  imagePlaceholder: { backgroundColor: '#d9d9d9' },
  likeBtn: { position: 'absolute', bottom: 12, right: 12, padding: 4, backgroundColor: 'transparent' },
  empty: { textAlign: 'center', marginTop: 40, color: '#666' },
  loadingCover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
