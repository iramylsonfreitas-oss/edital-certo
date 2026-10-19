import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  let next = "/dashboard";
  if (requestedNext) {
    const targetUrl = new URL(requestedNext, requestUrl.origin);
    if (targetUrl.origin === requestUrl.origin) {
      next = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    }
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link-expirado", requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(new URL("/login?error=configuracao", requestUrl.origin));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link-expirado", requestUrl.origin));
  }

  return response;
}

