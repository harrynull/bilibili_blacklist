export interface UserBlacklistItem{
    uid: string;
    num: number;
}
export interface UserBlacklist{
    [uid: string]: number;
}
