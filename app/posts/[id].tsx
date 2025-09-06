// app/posts/[id].tsx
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePosts } from '../../context/PostsContext';
import { supabase } from '../../lib/supabase';

type SelectedProduct = {
  url?: string | null;
  title?: string | null;
  image?: string | null;
  price?: string | null;
};

type PostRow = {
  id: string;
  owner_id: string;
  created_at: string;
  image_url: string | null;
  category: string | null;
  mainImage?: string | null;
  topsImage?: string | null;
  bottomsImage?: string | null;
  outerwearImage?: string | null;
  shoesImage?: string | null;
  selected_product?: SelectedProduct | null; // ★追加
};

const BG = '#FDECF2';
const ACCENT = '#FF2EDA';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts: ctxPosts } = usePosts();
  const router = useRouter();

  const ctxHit = useMemo(
    () => ctxPosts.find((p) => String(p.id) === String(id)) as (PostRow | undefined),
    [ctxPosts, id]
  );

  const [post, setPost] = useState<PostRow | null>(ctxHit ?? null);
  const [loading, setLoading] = useState(!ctxHit);

  useEffect(() => {
    if (ctxHit) { setPost(ctxHit); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('posts').select('*').eq('id', String(id)).maybeSingle();
      if (!cancelled) { if (error) console.warn(error); setPost((data as PostRow) ?? null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [ctxHit, id]);

  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);

  useEffect(() => { (async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  })(); }, []);

  const checkLike = useCallback(async () => {
    if (!userId || !id) return;
    const { data } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', String(id))
      .maybeSingle();
    setLiked(!!data);
  }, [userId, id]);

  useEffect(() => { checkLike(); }, [checkLike]);

  const toggleLike = async () => {
    if (!userId || !id) return;
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('post_id', String(id));
      setLiked(false);
    } else {
      await supabase.from('likes').insert({ user_id: userId, post_id: String(id) });
      setLiked(true);
    }
  };

  const goBackSafe = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const openIfUrl = async (uri?: string | null) => { if (!uri) return; try { await Linking.openURL(uri); } catch {} };

  if (loading) {
    return (<><Stack.Screen options={{ headerShown: false }} /><View style={styles.center}><Text>読み込み中…</Text></View></>);
  }
  if (!post) {
    return (<><Stack.Screen options={{ headerShown: false }} /><View style={styles.center}><Text>投稿が見つかりません</Text></View></>);
  }

  const main = post.mainImage || post.image_url || null;
  const items = [
    { key: 'tops', label: 'Tops', uri: post.topsImage },
    { key: 'bottoms', label: 'Bottoms/Skirt', uri: post.bottomsImage },
    { key: 'outer', label: 'Outerwear', uri: post.outerwearImage },
    { key: 'shoes', label: 'Shoes', uri: post.shoesImage },
  ] as const;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animationTypeForReplace: 'pop', gestureEnabled: true }} />

      <View style={styles.container}>
        {/* 左上 戻る */}
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={32} color={ACCENT} />
        </TouchableOpacity>

        {/* 右上 ハート（白丸なし） */}
        <TouchableOpacity
          style={styles.likeBtn}
          onPress={toggleLike}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="いいね"
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={30}
            color={liked ? ACCENT : '#222'}
          />
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, paddingTop: 60 }}>
          {main ? (
            <Image source={{ uri: main }} style={styles.mainImage} />
          ) : (
            <View style={[styles.mainImage, styles.itemPlaceholder]}>
              <Text style={styles.placeholderText}>メイン画像なし</Text>
            </View>
          )}

          {/* ★ 追加：関連商品（画像タップでURLへ） */}
          {post.selected_product?.image && post.selected_product?.url && (
            <View style={{ marginTop: 16, paddingHorizontal: 20 }}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>関連商品</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => openIfUrl(post.selected_product?.url)}
                style={{ borderRadius: 12, overflow: 'hidden' }}
              >
                <Image
                  source={{ uri: post.selected_product.image! }}
                  style={{ width: '100%', height: 240 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
              <View style={{ marginTop: 8 }}>
                {!!post.selected_product.title && (
                  <Text style={{ fontWeight: '600' }} numberOfLines={2}>{post.selected_product.title}</Text>
                )}
                {!!post.selected_product.price && (
                  <Text style={{ color: '#666', marginTop: 2 }}>参考価格: {post.selected_product.price}</Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.grid}>
            {items.map(({ key, label, uri }) => (
              <TouchableOpacity key={key} style={styles.card} activeOpacity={0.85} onPress={() => openIfUrl(uri)}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardLabel}>{label}</Text>
                  {uri ? (
                    <Image source={{ uri }} style={styles.itemImage} />
                  ) : (
                    <View style={[styles.itemImage, styles.itemPlaceholder]}>
                      <Text style={styles.placeholderText}>画像なし</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  likeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 4, backgroundColor: 'transparent' },
  mainImage: {
    width: '70%',
    aspectRatio: 3 / 4,
    backgroundColor: '#eee',
    borderRadius: 24,
    alignSelf: 'center',
    marginTop: 8,
  },
  grid: {
    marginTop: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: { width: '48%', marginBottom: 16 },
  cardInner: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: { fontSize: 12, fontWeight: '600', color: '#333', marginBottom: 8 },
  itemImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: '#eee' },
  itemPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 12, color: '#999' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
