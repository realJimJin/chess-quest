// The iOS build is a public app: it must not carry one player's personal
// reading list, ratings or repertoire. The web build is the owner's personal copy.
export const IS_IOS = process.env.NEXT_PUBLIC_TARGET === "ios";
