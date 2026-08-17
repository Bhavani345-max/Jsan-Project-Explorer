import { LoginForm } from "./LoginForm";
import { safeNext } from "./next-param";

export const metadata = { title: "Sign in" };

/**
 * Resolve `?next=` on the server and hand it down as a prop.
 *
 * Two reasons this is not read with useSearchParams() in the form itself:
 *
 *  1. Doing so put the whole page behind a Suspense boundary whose fallback was
 *     null, which made Next emit BAILOUT_TO_CLIENT_SIDE_RENDERING and prerender
 *     an EMPTY document — the sign-in page painted blank until the JS bundle
 *     landed. Reading it here costs a dynamic render and gives a complete first
 *     paint instead.
 *
 *  2. It is the natural place to validate it; see ./next-param.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(next)} />;
}
