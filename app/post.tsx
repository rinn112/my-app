// app/post.tsx
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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

import AppText from '../components/AppText';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadImageFromUri } from '../lib/uploadImage';

const PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://xqyztcyliqbhpdekmpjx.supabase.co';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// 商品URLプレビューAPI（既存）
const RESOLVE_PRODUCT_URL = 'https://fashion-ai-rayw6a068-mayu-shimamuras-projects.vercel.app/api/resolve-product';

// Edge Function 呼び出し（invoke → 直叩きフォールバック）
async function analyzeFashion(imageUrl: string) {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-fashion', {
      body: { image_url: imageUrl, mode: 'hf' }, // サーバ側でHF→失敗時Mock
    });
    if (!error && data) return data;
    console.warn('[AI] invoke error:', error);
  } catch (e: any) {
    console.warn('[AI] invoke throw:', e?.message || e);
  }
  try {
    const r = await fetch(`${PROJECT_URL}/functions/v1/analyze-fashion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON}`,
        'apikey': ANON,
      },
      body: JSON.stringify({ image_url: imageUrl, mode: 'hf' }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok) return json;
    console.warn('[AI] direct fetch failed:', r.status, json);
    return { error: json?.error || `HTTP ${r.status}` };
  } catch (e: any) {
    console.warn('[AI] direct fetch throw:', e?.message || e);
    return { error: String(e?.message || e) };
  }
}

type SelectedProduct = {
  url: string;
  title?: string | null;
  image?: string | null;
  price?: string | null;
  source?: string | null;
  fetched_at?: string | null;
};

// ---- 追加：外部画像も含めて必ず Storage に取り込むユーティリティ ----
function guessExtAndType(urlOrPath: string): { ext: 'jpg'|'jpeg'|'png'|'webp', type: string } {
  const u = urlOrPath.split('?')[0].toLowerCase();
  if (u.endsWith('.png'))  return { ext: 'png',  type: 'image/png' };
  if (u.endsWith('.webp')) return { ext: 'webp', type: 'image/webp' };
  if (u.endsWith('.jpeg')) return { ext: 'jpeg', type: 'image/jpeg' };
  return { ext: 'jpg', type: 'image/jpeg' };
}

/**
 * src が file:// でも https:// でも、必ず posts バケットにアップロードして
 * 公開URLを返す。投稿画のURLを一律 Supabase Storage 化するための関数。
 */
async function ensureImageInStorage(src: string, uid: string): Promise<string> {
  if (!uid) throw new Error('login required');
  const key = `${uid}/${Date.now()}`;

  if (/^https?:\/\//i.test(src)) {
    // 外部URLはそのまま fetch → Storage へ put（拡張子/Content-Type を推定）
    const { ext, type } = guessExtAndType(src);
    const { publicUrl } = await uploadImageFromUri({
      uri: src, key, bucket: 'posts', contentType: type, ext,
    });
    return publicUrl;
  } else {
    // ローカルは JPEG に圧縮してからアップロード（安定）
    const conv = await ImageManipulator.manipulateAsync(
      src,
      [{ resize: { width: 900 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    const { publicUrl } = await uploadImageFromUri({
      uri: conv.uri, key, bucket: 'posts', contentType: 'image/jpeg', ext: 'jpg',
    });
    return publicUrl;
  }
}

export default function PostPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mainImage?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const goBackSafe = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };

  const [mainImage, setMainImage] = useState<string | undefined>(params.mainImage);

  // 商品URL→プレビュー
  const [productUrl, setProductUrl] = useState('');
  const [productPreview, setProductPreview] = useState<SelectedProduct | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // 自動選択処理中フラグ
  const [autoPicking, setAutoPicking] = useState(false);

  // 投稿処理関連
  const [topsUrl, setTopsUrl] = useState('');
  const [bottomsUrl, setBottomsUrl] = useState('');
  const [outerwearUrl, setOuterwearUrl] = useState('');
  const [shoesUrl, setShoesUrl] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categories = ['カジュアル','スマート','フェミニン','モード','アウトドア'] as const;
  const [category, setCategory] = useState<string | null>(null); // 手動5択

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
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const fetchProductPreview = async () => {
    if (!productUrl.trim()) { Alert.alert('URLを入力してください'); return; }
    setLoadingPreview(true);
    try {
      const r = await fetch(RESOLVE_PRODUCT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim() }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      setProductPreview(json.product as SelectedProduct);
    } catch (e: any) {
      Alert.alert('取得に失敗しました', String(e?.message || e));
      setProductPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  // --- 自動選択：現在の画像で推論して5択に反映（成功=静かに選択, 失敗=ポップ） ---
  const autoPickCategory = async () => {
    try {
      setAutoPicking(true);

      // 推論に使う公開URLを確保（file:// の場合は一時アップロード）
      let targetUrl: string | null = null;
      if (mainImage) {
        if (/^https?:\/\//i.test(mainImage)) {
          targetUrl = mainImage;
        } else {
          if (!uid) throw new Error('ログインが必要です');
          const key = `${uid}/tmp/autocls-${Date.now()}`;
          const conv = await ImageManipulator.manipulateAsync(
            mainImage,
            [{ resize: { width: 600 } }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
          );
          const { publicUrl } = await uploadImageFromUri({
            uri: conv.uri, key, bucket: 'posts', contentType: 'image/jpeg', ext: 'jpg',
          });
          targetUrl = publicUrl;
        }
      } else if (productPreview?.image) {
        targetUrl = productPreview.image; // 推論は外部でも可（ここは表示影響なし）
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

      setCategory(predicted!); // 成功 → 静かに5択へ反映
    } catch {
      Alert.alert('失敗しました。もう一度お試しください。');
    } finally {
      setAutoPicking(false);
    }
  };

  const handleSubmit = async () => {
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    if (!mainImage && !productPreview?.image) { Alert.alert('メイン画像を選択してください'); return; }

    const lat = latitude ?? 35.681236;
    const lng = longitude ?? 139.767125;

    try {
      setSubmitting(true);

      // 1) メイン画像の公開URLを「必ず Storage 経由」で用意（ここが今回の修正ポイント）
      let uploadedMainUrl: string;
      if (mainImage) {
        uploadedMainUrl = await ensureImageInStorage(mainImage, uid);
      } else {
        // 商品プレビューのみのケースも必ず Storage へ取り込む
        uploadedMainUrl = await ensureImageInStorage(productPreview!.image!, uid);
      }

      // 2) 手動未選択なら、ここでもAIで初期値補完
      let aiCategory: string | null = null;
      let aiLabels: any = null;
      if (!category && uploadedMainUrl) {
        try {
          const ai: any = await analyzeFashion(uploadedMainUrl);
          aiCategory = (ai?.category as string) ?? null;
          aiLabels = ai?.ai_labels ?? null;
        } catch {}
      }

      // 3) posts へ保存（手動＞AI）
      const finalCategory = category ?? aiCategory ?? null;
      const meta = { category: finalCategory ?? '', topsUrl, bottomsUrl, outerwearUrl, shoesUrl };

      const payload: any = {
        owner_id: uid,
        image_url: uploadedMainUrl,   // ← 常に Supabase Storage のURL
        caption: JSON.stringify(meta), // 列が無ければ削除OK
        lat,                           // 列が無ければ削除OK
        lng,                           // 列が無ければ削除OK
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

  const renderEditableImage = (
    label: string, uri: string, setUri: (text: string) => void, fieldKey: string
  ) => {
    const hasImage = !!uri;
    return (
      <View style={styles.column}>
        <AppText style={styles.label}>{label}</AppText>
        <TouchableOpacity onPress={() => setEditingField(fieldKey)} activeOpacity={0.85}>
          {hasImage ? (<Image source={{ uri }} style={styles.itemImage} />)
          : (<View style={[styles.itemImage, styles.placeholder]}><AppText style={styles.placeholderText}>タップしてURL入力</AppText></View>)}
        </TouchableOpacity>
        {editingField === fieldKey && (
          <TextInput
            style={styles.input}
            placeholder={`${label} の画像URL`}
            placeholderTextColor="#9aa"
            value={uri}
            onChangeText={setUri}
            onBlur={() => setEditingField(null)}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown:false, gestureEnabled:true, animationTypeForReplace:'pop' }} />
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={32} color="#FF2EDA" />
        </TouchableOpacity>

        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios' ? 'padding' : undefined}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* メイン画像 */}
            <TouchableOpacity onPress={() => pickImage(setMainImage)} activeOpacity={0.85}>
              {mainImage ? (
                <Image source={{ uri: mainImage }} style={styles.mainImage} />
              ) : (
                <View style={[styles.mainImage, styles.placeholder]}>
                  <AppText style={styles.placeholderText}>タップしてメイン画像を選択</AppText>
                </View>
              )}
            </TouchableOpacity>

            {/* 服の雰囲気 + 自動選択ボタン */}
            <View style={styles.headerRow}>
              <AppText style={styles.categoryTitle}>服の雰囲気</AppText>
              <TouchableOpacity onPress={autoPickCategory} style={styles.autoBtn} activeOpacity={0.85} disabled={autoPicking}>
                {autoPicking ? <ActivityIndicator /> : <Text style={styles.autoBtnText}>自動選択</Text>}
              </TouchableOpacity>
            </View>

            {/* 5択 */}
            <View style={styles.categoryRow}>
              {(['カジュアル','スマート','フェミニン','モード','アウトドア'] as const).map((c) => (
                <TouchableOpacity key={c}
                  style={[styles.categoryBtn, { backgroundColor: category===c ? '#FF6EF5' : '#E5C2FF' }]}
                  onPress={() => setCategory(c)}>
                  <AppText style={styles.categoryText}>{c}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            {/* 商品URL → プレビュー */}
            <View style={{ marginTop: 6 }}>
              <AppText style={styles.sectionTitle}>商品URL（任意）</AppText>
              <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
                <TextInput
                  style={[styles.input, { flex:1, height:44 }]}
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
                  style={{ height:44, paddingHorizontal:12, borderRadius:10, backgroundColor:'#FF6EF5', alignItems:'center', justifyContent:'center' }}
                  activeOpacity={0.85}
                >
                  {loadingPreview ? <ActivityIndicator /> : <Text style={{ color:'#fff', fontWeight:'700' }}>プレビュー</Text>}
                </TouchableOpacity>
              </View>

              {productPreview && (
                <View style={{ marginTop:10, borderWidth:1, borderColor:'#eee', borderRadius:12, overflow:'hidden', backgroundColor:'#fff' }}>
                  {!!productPreview.image && (
                    <Image source={{ uri: productPreview.image }} style={{ width:'100%', height:200 }} resizeMode="cover" />
                  )}
                  <View style={{ padding:10 }}>
                    <Text style={{ fontWeight:'700' }} numberOfLines={2}>
                      {productPreview.title || '商品'}
                    </Text>
                    {!!productPreview.price && (
                      <Text style={{ marginTop:4, color:'#666' }}>参考価格: {productPreview.price}</Text>
                    )}
                    <Text style={{ marginTop:6, color:'#888' }} numberOfLines={1}>
                      {productPreview.url}
                    </Text>

                    <View style={{ flexDirection:'row', gap:10, marginTop:10 }}>
                      <TouchableOpacity
                        onPress={() => productPreview.image && setMainImage(productPreview.image!)}
                        style={{ backgroundColor:'#FF2EDA', paddingHorizontal:12, paddingVertical:8, borderRadius:10 }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color:'#fff', fontWeight:'700' }}>メインに設定</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setProductPreview(null); setProductUrl(''); }}
                        style={{ backgroundColor:'#ddd', paddingHorizontal:12, paddingVertical:8, borderRadius:10 }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color:'#222', fontWeight:'700' }}>クリア</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* 部位画像入力 */}
            <View style={styles.row}>
              {renderEditableImage('Tops', topsUrl, setTopsUrl, 'tops')}
              {renderEditableImage('Bottoms/Skirt', bottomsUrl, setBottomsUrl, 'bottoms')}
            </View>
            <View style={styles.row}>
              {renderEditableImage('Outerwear', outerwearUrl, setOuterwearUrl, 'outerwear')}
              {renderEditableImage('Shoes', shoesUrl, setShoesUrl, 'shoes')}
            </View>

            {/* 送信ボタン */}
            <TouchableOpacity style={[styles.submitButton, (submitting || autoPicking) && { opacity:0.6 }]}
              onPress={handleSubmit} disabled={submitting || autoPicking}>
              <AppText style={styles.submitText}>
                {submitting ? '投稿中…' : '投稿する'}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:'#FDECF2' },
  scroll:{ flex:1 },
  content:{ padding:20, paddingBottom:40 },
  backButton:{ position:'absolute', top:50, left:20, zIndex:10 },
  mainImage:{ width:'80%', alignSelf:'center', aspectRatio:3/4, borderRadius:16, backgroundColor:'#eee', marginBottom:16 },

  headerRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8, paddingHorizontal:4 },
  categoryTitle:{ fontSize:22, fontWeight:'600' },
  autoBtn:{ backgroundColor:'#FF6EF5', paddingHorizontal:14, paddingVertical:10, borderRadius:12 },
  autoBtnText:{ color:'#fff', fontWeight:'700' },

  sectionTitle:{ fontSize:22, fontWeight:'600', marginBottom:12, textAlign:'left' },

  categoryRow:{ flexDirection:'row', flexWrap:'wrap', justifyContent:'center', marginBottom:20 },
  categoryBtn:{ paddingHorizontal:16, paddingVertical:10, borderRadius:20, margin:6, minWidth:90, alignItems:'center' },
  categoryText:{ color:'#111', fontWeight:'600' },

  row:{ flexDirection:'row', justifyContent:'space-between', gap:20, width:'93%', alignSelf:'center', marginBottom:40 },
  column:{ flex:1, alignItems:'center' },
  itemImage:{ width:'100%', aspectRatio:3/4, borderRadius:8, backgroundColor:'#eee' },
  placeholder:{ alignItems:'center', justifyContent:'center' },
  placeholderText:{ color:'#999', fontSize:12 },
  label:{ fontSize:22, fontWeight:'600', marginBottom:10 },
  input:{ backgroundColor:'#fff', borderRadius:8, padding:10, borderWidth:1, borderColor:'#ccc' },

  submitButton:{ marginTop:10, backgroundColor:'#FF2EDA', paddingHorizontal:24, paddingVertical:12, borderRadius:24, alignItems:'center' },
  submitText:{ color:'#fff', fontWeight:'bold', fontSize:20 },
});
