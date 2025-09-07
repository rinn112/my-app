// app/post.tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { Image as ExpoImage } from 'expo-image';

import AppText from '../components/AppText';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadImageFromUri } from '../lib/uploadImage';

const PROJECT_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://xqyztcyliqbhpdekmpjx.supabase.co';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const RESOLVE_PRODUCT_URL =
  'https://fashion-ai-pd7f25pkb-mayu-shimamuras-projects.vercel.app/api/resolve-product';

type SelectedProduct = {
  url: string;
  title?: string | null;
  image?: string | null;
  price?: string | null;
  source?: string | null;
  fetched_at?: string | null;
};

const normalizeUrl = (u: string) => {
  const s = (u || '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `https://zozo.jp${s}`;
  if (/^zozo\.jp/i.test(s)) return `https://${s}`;
  return `https://${s}`;
};

const dedupeUrl = (s: string) => {
  try {
    return String(s).replace(/(https?:\/\/[^\s]+?)\1+/, '$1');
  } catch {
    return String(s);
  }
};

const shot = (u: string) =>
  `https://image.thum.io/get/width/1200/noanimate/${dedupeUrl(String(u))}`;

const decodeThumUrl = (u?: string | null) => {
  try {
    if (!u) return '';
    const s = String(u);
    if (s.includes('image.thum.io') && s.includes('noanimate/')) {
      const tail = s.split('noanimate/')[1] || '';
      const raw = decodeURIComponent(tail);
      return `https://image.thum.io/get/width/1200/noanimate/${dedupeUrl(raw)}`;
    }
    return s;
  } catch {
    return String(u ?? '');
  }
};

async function analyzeFashion(imageUrl: string) {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-fashion', {
      body: { image_url: imageUrl, mode: 'hf' },
    });
    if (!error && data) return data;
  } catch {}
  try {
    const r = await fetch(`${PROJECT_URL}/functions/v1/analyze-fashion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
      },
      body: JSON.stringify({ image_url: imageUrl, mode: 'hf' }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok) return json;
    return { error: json?.error || `HTTP ${r.status}` };
  } catch (e: any) {
    return { error: String(e?.message || e) };
  }
}

function guessExtAndType(urlOrPath: string): { ext: 'jpg' | 'jpeg' | 'png' | 'webp'; type: string } {
  const u = urlOrPath.split('?')[0].toLowerCase();
  if (u.endsWith('.png')) return { ext: 'png', type: 'image/png' };
  if (u.endsWith('.webp')) return { ext: 'webp', type: 'image/webp' };
  if (u.endsWith('.jpeg')) return { ext: 'jpeg', type: 'image/jpeg' };
  return { ext: 'jpg', type: 'image/jpeg' };
}

async function ensureImageInStorage(src: string, uid: string): Promise<string> {
  if (!uid) throw new Error('login required');
  const key = `${uid}/${Date.now()}`;
  if (/^https?:\/\//i.test(src)) {
    const { ext, type } = guessExtAndType(src);
    const { publicUrl } = await uploadImageFromUri({
      uri: src,
      key,
      bucket: 'posts',
      contentType: type,
      ext,
    });
    return publicUrl;
  } else {
    const conv = await ImageManipulator.manipulateAsync(
      src,
      [{ resize: { width: 900 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );
    const { publicUrl } = await uploadImageFromUri({
      uri: conv.uri,
      key,
      bucket: 'posts',
      contentType: 'image/jpeg',
      ext: 'jpg',
    });
    return publicUrl;
  }
}

export default function PostPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mainImage?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const goBackSafe = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const [mainImage, setMainImage] = useState<string | undefined>(params.mainImage);

  const [productUrl, setProductUrl] = useState('');
  const [productPreview, setProductPreview] = useState<SelectedProduct | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [links, setLinks] = useState<Record<'tops' | 'bottoms' | 'outerwear' | 'shoes', string>>({
    tops: '',
    bottoms: '',
    outerwear: '',
    shoes: '',
  });
  const [topsUrl, setTopsUrl] = useState('');
  const [bottomsUrl, setBottomsUrl] = useState('');
  const [outerwearUrl, setOuterwearUrl] = useState('');
  const [shoesUrl, setShoesUrl] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);

  const categories = ['カジュアル', 'スマート', 'フェミニン', 'モード', 'アウトドア'] as const;
  const [category, setCategory] = useState<string | null>(null);
  const [autoPicking, setAutoPicking] = useState(false);

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
    })();
  }, []);

  const pickImage = async (setImage: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    } as any);
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const fetchProductPreview = async () => {
    if (!productUrl.trim()) {
      Alert.alert('URLを入力してください');
      return;
    }
    setLoadingPreview(true);
    try {
      const r = await fetch(RESOLVE_PRODUCT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: dedupeUrl(normalizeUrl(productUrl)) }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      const prod: any = json.product || {};
      if (prod.url) prod.url = dedupeUrl(prod.url);
      if (!prod.image && prod.url) prod.image = shot(prod.url);
      prod.image = decodeThumUrl(prod.image);
      setProductPreview(prod);
    } catch (e: any) {
      Alert.alert('取得に失敗しました', String(e?.message || e));
      setProductPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const resolvePart = async (field: 'tops' | 'bottoms' | 'outerwear' | 'shoes') => {
    const raw = links[field];
    if (!raw?.trim()) return;
    try {
      const r = await fetch(RESOLVE_PRODUCT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: dedupeUrl(normalizeUrl(raw)) }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      const canonical = dedupeUrl(json.product?.url || normalizeUrl(raw));
      const image = decodeThumUrl(json.product?.image || shot(canonical));
      switch (field) {
        case 'tops':
          setTopsUrl(image || '');
          break;
        case 'bottoms':
          setBottomsUrl(image || '');
          break;
        case 'outerwear':
          setOuterwearUrl(image || '');
          break;
        case 'shoes':
          setShoesUrl(image || '');
          break;
      }
      setLinks((p) => ({ ...p, [field]: canonical }));
    } catch (e: any) {
      Alert.alert(`${field} の取得に失敗しました`, String(e?.message || e));
    }
  };

  const autoPickCategory = async () => {
    try {
      setAutoPicking(true);
      let targetUrl: string | null = null;
      if (mainImage) {
        if (/^https?:\/\//i.test(mainImage)) targetUrl = mainImage;
        else {
          if (!uid) throw new Error('ログインが必要です');
          const key = `${uid}/tmp/autocls-${Date.now()}`;
          const conv = await ImageManipulator.manipulateAsync(
            mainImage,
            [{ resize: { width: 600 } }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
          );
          const { publicUrl } = await uploadImageFromUri({
            uri: conv.uri,
            key,
            bucket: 'posts',
            contentType: 'image/jpeg',
            ext: 'jpg',
          });
          targetUrl = publicUrl;
        }
      } else if (productPreview?.image) {
        targetUrl = productPreview.image;
      }
      if (!targetUrl) {
        Alert.alert('失敗しました。もう一度お試しください。');
        return;
      }
      const once: any = await analyzeFashion(targetUrl);
      let predicted = once?.category as string | undefined;
      const ok = categories.includes((predicted as any) ?? '');
      if (!ok) {
        const twice: any = await analyzeFashion(targetUrl);
        predicted = twice?.category as string | undefined;
        if (!categories.includes((predicted as any) ?? '')) {
          Alert.alert('失敗しました。もう一度お試しください。');
          return;
        }
      }
      setCategory(predicted!);
    } catch {
      Alert.alert('失敗しました。もう一度お試しください。');
    } finally {
      setAutoPicking(false);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!uid) {
      Alert.alert('ログインが必要です');
      return;
    }
    if (!mainImage && !productPreview?.image) {
      Alert.alert('メイン画像を選択してください');
      return;
    }
    const lat = latitude ?? 35.681236;
    const lng = longitude ?? 139.767125;
    try {
      setSubmitting(true);

      let uploadedMainUrl: string;
      if (mainImage) {
        uploadedMainUrl = await ensureImageInStorage(mainImage, uid);
      } else {
        uploadedMainUrl = await ensureImageInStorage(productPreview!.image!, uid);
      }

      let aiCategory: string | null = null;
      let aiLabels: any = null;
      if (!category && uploadedMainUrl) {
        try {
          const ai: any = await analyzeFashion(uploadedMainUrl);
          aiCategory = (ai?.category as string) ?? null;
          aiLabels = ai?.ai_labels ?? null;
        } catch {}
      }
      const finalCategory = category ?? aiCategory ?? null;

      const meta = {
        category: finalCategory ?? '',
        parts: {
          tops: { link: links.tops || null, image: topsUrl || null },
          bottoms: { link: links.bottoms || null, image: bottomsUrl || null },
          outerwear: { link: links.outerwear || null, image: outerwearUrl || null },
          shoes: { link: links.shoes || null, image: shoesUrl || null },
        },
      };

      const payload: any = {
        owner_id: uid,
        image_url: uploadedMainUrl,
        caption: JSON.stringify(meta),
        lat,
        lng,
        selected_product: productPreview ?? null,
        category: finalCategory,
        ai_labels: aiLabels,
      };

      const { error } = await supabase.from('posts').insert(payload).select('id').single();
      if (error) throw new Error(error.message);

      Alert.alert('投稿しました');
      router.replace('/');
    } catch (e: any) {
      Alert.alert('投稿に失敗しました', e?.message ?? 'unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const PartEditor = ({
    field,
    label,
    uri,
  }: {
    field: 'tops' | 'bottoms' | 'outerwear' | 'shoes';
    label: string;
    uri: string;
  }) => {
    const link = links[field] || '';
    const showImage = !!uri;
    const setUri = (u: string) => {
      switch (field) {
        case 'tops':
          setTopsUrl(u);
          break;
        case 'bottoms':
          setBottomsUrl(u);
          break;
        case 'outerwear':
          setOuterwearUrl(u);
          break;
        case 'shoes':
          setShoesUrl(u);
          break;
      }
    };

    return (
      <View style={styles.column}>
        <AppText style={styles.label}>{label}</AppText>
        <TouchableOpacity onPress={() => setEditingField(field)} activeOpacity={0.85}>
          {showImage ? (
            <ExpoImage
              source={{ uri: decodeThumUrl(uri) }}
              style={styles.itemImage}
              contentFit="cover"
              cachePolicy="none"
              transition={150}
            
    onLoadStart={() => console.log('[img] start preview')}
    onLoad={() => console.log('[img] loaded preview')}
    onError={e => console.log('IMAGE_ERROR preview', e?.nativeEvent)}
  />
          ) : (
            <View style={[styles.itemImage, styles.placeholder]}>
              <AppText style={styles.placeholderText}>タップしてURL入力</AppText>
            </View>
          )}
        </TouchableOpacity>
        {editingField === field && (
          <TextInput
            style={styles.input}
            placeholder={`${label} の商品URL（例: /shop/... もOK）`}
            placeholderTextColor="#9aa"
            value={link}
            onChangeText={(t) => setLinks((p) => ({ ...p, [field]: t }))}
            onBlur={async () => {
              setEditingField(null);
              await resolvePart(field);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, animationTypeForReplace: 'pop' }} />
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={32} color="#FF2EDA" />
        </TouchableOpacity>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => pickImage(setMainImage)} activeOpacity={0.85}>
              {mainImage ? (
                <Image source={{ uri: mainImage }} style={styles.mainImage} />
              ) : (
                <View style={[styles.mainImage, styles.placeholder]}>
                  <AppText style={styles.placeholderText}>タップしてメイン画像を選択</AppText>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.headerRow}>
              <AppText style={styles.categoryTitle}>服の雰囲気</AppText>
              <TouchableOpacity onPress={autoPickCategory} style={styles.autoBtn} activeOpacity={0.85} disabled={autoPicking}>
                {autoPicking ? <ActivityIndicator /> : <Text style={styles.autoBtnText}>自動選択</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.categoryRow}>
              {(['カジュアル', 'スマート', 'フェミニン', 'モード', 'アウトドア'] as const).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.categoryBtn, { backgroundColor: category === c ? '#FF6EF5' : '#E5C2FF' }]}
                  onPress={() => setCategory(c)}
                >
                  <AppText style={styles.categoryText}>{c}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <PartEditor field="tops" label="Tops" uri={topsUrl} />
              <PartEditor field="bottoms" label="Bottoms/Skirt" uri={bottomsUrl} />
            </View>
            <View style={styles.row}>
              <PartEditor field="outerwear" label="Outerwear" uri={outerwearUrl} />
              <PartEditor field="shoes" label="Shoes" uri={shoesUrl} />
            </View>

            <View style={{ marginTop: 6 }}>
              <AppText style={styles.sectionTitle}>商品URL（任意）</AppText>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, height: 44 }]}
                  placeholder="https://..."
                  placeholderTextColor="#9aa"
                  value={productUrl}
                  onChangeText={setProductUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <TouchableOpacity
                  onPress={fetchProductPreview}
                  style={{
                    height: 44,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: '#FF6EF5',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  activeOpacity={0.85}
                >
                  {loadingPreview ? <ActivityIndicator /> : <Text style={{ color: '#fff', fontWeight: '700' }}>プレビュー</Text>}
                </TouchableOpacity>
              </View>

              {productPreview && (
                <View
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: '#eee',
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                  }}
                >
                  {!!(productPreview?.image || productPreview?.url) ? (
                    <ExpoImage
                      source={{ uri: decodeThumUrl(productPreview?.image || (productPreview?.url ? shot(productPreview.url) : '')) }}
                      style={{ width: '100%', height: 240, borderRadius: 12, backgroundColor: '#eee' }}
                      contentFit="cover"
                      cachePolicy="none"
                      transition={150}
                    />
                  ) : (
                    <View style={{ width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#888' }}>画像が取得できませんでした</Text>
                    </View>
                  )}
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontWeight: '700' }} numberOfLines={2}>
                      {productPreview.title || '商品'}
                    </Text>
                    {!!productPreview.price && (
                      <Text style={{ marginTop: 4, color: '#666' }}>参考価格: {productPreview.price}</Text>
                    )}
                    <Text style={{ marginTop: 6, color: '#888' }} numberOfLines={1}>
                      {productPreview.url}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => productPreview.image && setMainImage(productPreview.image!)}
                        style={{ backgroundColor: '#FF2EDA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>メインに設定</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setProductPreview(null);
                          setProductUrl('');
                        }}
                        style={{ backgroundColor: '#ddd', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color: '#222', fontWeight: '700' }}>クリア</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting || autoPicking}>
              <AppText style={styles.submitText}>{submitting ? '投稿中…' : '投稿する'}</AppText>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDECF2' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  mainImage: { width: '80%', alignSelf: 'center', height: 180, borderRadius: 16, backgroundColor: '#eee', marginBottom: 16 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  categoryTitle: { fontSize: 22, fontWeight: '600' },
  autoBtn: { backgroundColor: '#FF6EF5', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  autoBtnText: { color: '#fff', fontWeight: '700' },

  sectionTitle: { fontSize: 22, fontWeight: '600', marginBottom: 12, textAlign: 'left' },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 },
  categoryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, margin: 6, minWidth: 90, alignItems: 'center' },
  categoryText: { color: '#111', fontWeight: '600' },

  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 20, width: '93%', alignSelf: 'center', marginBottom: 40 },
  column: { flex: 1, alignItems: 'center' },
  itemImage: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#eee' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#999', fontSize: 12 },
  label: { fontSize: 22, fontWeight: '600', marginBottom: 10 },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#ccc' },

  submitButton: { marginTop: 10, backgroundColor: '#FF2EDA', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
});
