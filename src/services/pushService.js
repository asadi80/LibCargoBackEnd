//service/pushService 
const sendPushNotification = async (
  token,
  title,
  body,
  data = {}
) => {
  await fetch(
    "https://exp.host/--/api/v2/push/send",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        sound: "default",
        title,
        body,
        data,
      }),
    }
  );
};

module.exports = {
  sendPushNotification,
};