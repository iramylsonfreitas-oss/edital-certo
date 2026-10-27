import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      }
    }
  });

  const { data } = await supabase.auth.getClaims();
  // Only evaluation accounts need the additional live UX check. Database RLS
  // enforces access for every account, independently of this signed JWT flag.
  const publicPath = /^\/(?:$|login(?:\/|$)|signup(?:\/|$)|auth(?:\/|$)|privacy(?:\/|$)|terms(?:\/|$)|access-blocked(?:\/|$))/;
  if (data?.claims?.app_metadata?.evaluation_account === true && !publicPath.test(request.nextUrl.pathname)) {
    const access = await supabase.rpc("current_account_access");
    if (access.error || access.data !== true) {
      const blocked = NextResponse.redirect(new URL("/access-blocked", request.url));
      for (const cookie of response.cookies.getAll()) blocked.cookies.set(cookie);
      return blocked;
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};

