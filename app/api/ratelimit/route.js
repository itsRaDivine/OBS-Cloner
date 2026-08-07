import { NextResponse } from 'next/server';
import { peekStatus } from '@/lib/ratelimit';

// Kullanıcının token'ını tekrar Discord'a sormadan, client tarafında
// zaten doğrulanmış userId ile kalan hak bilgisini döndürür.
// Not: Bu endpoint sadece görüntüleme amaçlıdır, gerçek limit kontrolü
// /api/clone içinde token bazlı olarak tekrar yapılır.
export async function POST(request) {
  const body = await request.json();
  const { userId, password } = body;

  if (password !== process.env.NEXT_PUBLIC_API_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!userId) {
    return NextResponse.json({ error: 'MISSING_USER_ID' }, { status: 400 });
  }

  const status = peekStatus(userId);
  return NextResponse.json(status);
}
