// hooks/useVisiblePostsToday.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type VisiblePost = {
  id: string;
  owner_id: string;
  image_url: string | null;
  caption: string | null;
  lat: number;
  lng: number;
  created_at: string;
};

export function useVisiblePostsToday() {
  const [posts, setPosts] = useState<VisiblePost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('visible_posts_today') // ← view 名
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.log('fetch visible_posts_today error', error);
      setPosts([]);
    } else {
      setPosts((data as VisiblePost[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { posts, loading, refresh: fetchOnce };
}

// 念のため default でも輸出（インポートの書き方がどちらでも動く）
export default useVisiblePostsToday;
