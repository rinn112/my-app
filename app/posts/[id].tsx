import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type SelectedProduct = { url?: string|null; title?: string|null; image?: string|null; price?: string|null; };
type PostRow = {
  id: string;
  owner_id: string;
  created_at: string;
  image_url: string | null;
  category: string | null;
  caption: string | null;                 // ← ここを読む
  selected_product?: SelectedProduct | null;
};

const BG = '#FDECF2';
const ACCENT = '#FF2EDA';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('posts').select('*').eq('id', String(id)).maybeSingle();
      if (!cancelled) { if (error) console.warn(error); setPost((data as PostRow) ?? null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const meta = useMemo(() => {
    try { return post?.caption ? JSON.parse(post.caption) : {}; } catch { return {}; }
  }, [post?.caption]);

  const parts = (meta?.parts ?? {}) as any;
  const items = [
    { key: 'tops',     label: 'Tops',          image: parts?.tops?.image,     link: parts?.tops?.link },
    { key: 'bottoms',  label: 'Bottoms/Skirt', image: parts?.bottoms?.image,  link: parts?.bottoms?.link },
    { key: 'outerwear',label: 'Outerwear',     image: parts?.outerwear?.image,link: parts?.outerwear?.link },
    { key: 'shoes',    label: 'Shoes',         image: parts?.shoes?.image,    link: parts?.shoes?.link },
  ];

  const openIfUrl = async (u?: string|null) => { if (!u) return; try { await Linking.openURL(u); } catch {} };

  if (loading) {
    return (<><Stack.Screen options={{ headerShown:false }} /><View style={styles.center}><Text>読み込み中…</Text></View></>);
  }
  if (!post) {
    return (<><Stack.Screen options={{ headerShown:false }} /><View style={styles.center}><Text>投稿が見つかりません</Text></View></>);
  }

  const heroImage = post.selected_product?.image || post.image_url;
  const heroLink  = post.selected_product?.url || undefined;

  return (
    <>
      <Stack.Screen options={{ headerShown:false, animationTypeForReplace:'pop', gestureEnabled:true }} />
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => openIfUrl('exp://close')} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={32} color={ACCENT} />
        </TouchableOpacity>

        <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingTop:60, paddingBottom:32 }}>
          {/* メイン（タップでURLへ） */}
          {heroImage ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => openIfUrl(heroLink || heroImage)}>
              <Image source={{ uri: heroImage }} style={styles.mainImage} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.mainImage, styles.itemPlaceholder]}><Text style={styles.placeholderText}>メイン画像なし</Text></View>
          )}

          {/* 雰囲気 */}
          {post.category && (
            <View style={styles.modeBox}>
              <Text style={styles.modeLabel}>雰囲気</Text>
              <Text style={styles.modeValue}>{post.category}</Text>
            </View>
          )}

          {/* 部位グリッド（画像タップで商品URLへ） */}
          <View style={styles.grid}>
            {items.map(({ key, label, image, link }) => (
              <TouchableOpacity key={key} style={styles.card} activeOpacity={0.85} onPress={() => openIfUrl(link || image)}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardLabel}>{label}</Text>
                  {image ? (
                    <Image source={{ uri: image }} style={styles.itemImage} />
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
  container: { flex:1, backgroundColor: BG },
  center: { flex:1, alignItems:'center', justifyContent:'center' },
  backButton: { position:'absolute', top:50, left:20, zIndex:10 },

  mainImage: { width:'90%', alignSelf:'center', aspectRatio:3/4, borderRadius:16, backgroundColor:'#eee' },

  modeBox: { marginTop:16, paddingHorizontal:20, flexDirection:'row', alignItems:'center', gap:8 },
  modeLabel: { fontWeight:'700', color:'#666' },
  modeValue: { fontWeight:'700', color:'#222' },

  grid: { marginTop:20, paddingHorizontal:20, gap:14 },
  card: { borderRadius:12, overflow:'hidden', backgroundColor:'#fff' },
  cardInner: { padding:12, gap:8 },
  cardLabel: { fontWeight:'700' },

  itemImage: { width:'100%', aspectRatio:3/4, borderRadius:8, backgroundColor:'#eee' },
  itemPlaceholder: { alignItems:'center', justifyContent:'center' },
  placeholderText: { color:'#999' },
});
