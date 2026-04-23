export const getSessionData = () => {
    const user = sessionStorage.getItem("sav_user");
    if(!user){
        return false
    }
    else{
        return true
    }
}