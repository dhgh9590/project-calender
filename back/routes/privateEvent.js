const express = require("express");
const Sequelize = require("sequelize");
const { Op } = require("sequelize");
const {
  sequelize,
  Calendar,
  User,
  PrivateEvent,
  PrivateCalendar,
  ProfileImage,
  RealTimeAlert,
  Event,
} = require("../models");
const router = express.Router();
const authJWT = require("../utils/authJWT");
const { addPrivateAlert, deletePrivateAlerts } = require("../realTimeAlerts");

router.post("/getPrivateEvent", authJWT, async (req, res, next) => {
  try {
    const events = await PrivateEvent.findOne({
      where: { id: req.body.eventId },
    });

    const groupEvent = events.groupEventId
      ? await Event.findOne({
          where: { id: events.groupEventId },
          attributes: [],
          include: [
            {
              model: User,
              as: "EventHost",
              attributes: {
                exclude: ["password", "checkedCalendar"],
              },
            },
            {
              model: User,
              as: "EventMembers",
              attributes: ["id", "email", "nickname"],
              include: [
                {
                  model: ProfileImage,
                  attributes: ["src"],
                },
              ],
            },
          ],
        })
      : null;

    const eventCopy = JSON.parse(JSON.stringify(events));
    eventCopy["EventHost"] = groupEvent.EventHost;
    eventCopy["EventMembers"] = groupEvent.EventMembers;

    const realTimeAlert = await RealTimeAlert.findAll({
      where: {
        [Op.and]: {
          UserId: req.myId,
          PrivateEventId: req.body.eventId,
        },
      },
      paranoid: false,
      attributes:
        events.allDay === 1
          ? ["type", "time", "hour", "minute"]
          : ["type", "time"],
    });

    return res.status(200).send({
      event: eventCopy,
      realTimeAlert: realTimeAlert,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 개인이벤트 만들기
router.post("/createPrivateEvent", authJWT, async (req, res, next) => {
  try {
    const me = await User.findOne({
      where: {
        id: req.myId,
      },
    });
    const privateCalendar = await me.getPrivateCalendar();

    await sequelize.transaction(async (t) => {
      const privateEvent = await privateCalendar.createPrivateEvent(
        {
          name: req.body.eventName,
          color: req.body.color ? req.body.color : null,
          busy: req.body.busy,
          memo: req.body.memo,
          allDay: req.body.allDay,
          startTime: req.body.startTime,
          endTime: req.body.endTime,
        },
        { transaction: t }
      );

      if (req.body.alerts) {
        if (req.body.allDay === 1) {
          await Promise.all(
            req.body.alerts.map(async (alert) => {
              if (alert.type === "day") {
                const content = `${req.body.eventName}시작 ${alert.time}일 전 입니다`;
                const date = new Date(req.body.startTime);
                date.setDate(date.getDate() - alert.time);
                date.setHours(alert.hour);
                date.setMinutes(parseInt(alert.minute ? alert.minute : 0));
                await addPrivateAlert(
                  privateEvent.id,
                  req.body.allDay,
                  alert.type,
                  alert.time,
                  alert.hour,
                  alert.minute,
                  content,
                  date,
                  req.myId,
                  req.app.get("io"),
                  req.app.get("onlineUsers")
                );
              } else if (alert.type === "week") {
                const content = `${req.body.eventName}시작 ${alert.time}주 전 입니다`;
                const date = new Date(req.body.startTime);
                date.setDate(date.getDate() - alert.time * 7);
                date.setHours(alert.hour);
                date.setMinutes(parseInt(alert.minute ? alert.minute : 0));
                await addPrivateAlert(
                  privateEvent.id,
                  req.body.allDay,
                  alert.type,
                  alert.time,
                  alert.hour,
                  alert.minute,
                  content,
                  date,
                  req.myId,
                  req.app.get("io"),
                  req.app.get("onlineUsers")
                );
              }
            })
          );
        } else {
          await Promise.all(
            req.body.alerts.map(async (alert) => {
              if (alert.type === "minute") {
                const content = `${req.body.eventName}시작 ${alert.time}분 전입니다!`;
                const date = new Date(req.body.startTime);
                date.setMinutes(date.getMinutes() - parseInt(alert.time));
                await addPrivateAlert(
                  privateEvent.id,
                  req.body.allDay,
                  alert.type,
                  alert.time,
                  null,
                  null,
                  content,
                  date,
                  req.myId,
                  req.app.get("io"),
                  req.app.get("onlineUsers")
                );
              } else if (alert.type === "hour") {
                const content = `${req.body.eventName}시작 ${alert.time}시간 전입니다!`;
                const date = new Date(req.body.startTime);
                date.setHours(date.getHours() - parseInt(alert.time));
                await addPrivateAlert(
                  privateEvent.id,
                  req.body.allDay,
                  alert.type,
                  alert.time,
                  null,
                  null,
                  content,
                  date,
                  req.myId,
                  req.app.get("io"),
                  req.app.get("onlineUsers")
                );
              } else if (alert.type === "day") {
                const content = `${req.body.eventName}시작 ${alert.time}일 전입니다!`;
                const date = new Date(req.body.startTime);
                date.setDate(date.getDate() - parseInt(alert.time));
                await addPrivateAlert(
                  privateEvent.id,
                  req.body.allDay,
                  alert.type,
                  alert.time,
                  null,
                  null,
                  content,
                  date,
                  req.myId,
                  req.app.get("io"),
                  req.app.get("onlineUsers")
                );
              } else if (alert.type === "week") {
                const content = `${req.body.eventName}시작 ${alert.time}주 전입니다!`;
                const date = new Date(req.body.startTime);
                date.setDate(date.getDate() - parseInt(alert.time) * 7);
                await addPrivateAlert(
                  privateEvent.id,
                  req.body.allDay,
                  alert.type,
                  alert.time,
                  null,
                  null,
                  content,
                  date,
                  req.myId,
                  req.app.get("io"),
                  req.app.get("onlineUsers")
                );
              }
            })
          );
        }
      }

      return res.status(200).send(privateEvent);
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 개인이벤트 업데이트
router.post("/editPrivateEvent", authJWT, async (req, res, next) => {
  try {
    const myEvent = await PrivateEvent.findOne({
      id: req.body.eventId,
    });

    if (!myEvent) {
      res
        .status(400)
        .json({ message: "수정할 개인이벤트의 조회 결과가 없습니다" });
    }

    await sequelize.transaction(async (t) => {
      await myEvent.update(
        {
          name: req.body.eventName,
          color: req.body.color ? req.body.color : null,
          busy: req.body.busy,
          memo: req.body.memo,
          allDay: req.body.allDay,
          startTime: req.body.startTime,
          endTime: req.body.endTime,
        },
        { transaction: t }
      );
    });

    await deletePrivateAlerts(req.myId, myEvent.id);

    if (req.body.alerts) {
      if (req.body.allDay === 1) {
        await Promise.all(
          req.body.alerts.map(async (alert) => {
            if (alert.type === "day") {
              const content = `${req.body.eventName}시작 ${alert.time}일 전 입니다`;
              const date = new Date(req.body.startTime);
              date.setDate(date.getDate() - alert.time);
              date.setHours(alert.hour);
              date.setMinutes(parseInt(alert.minute ? alert.minute : 0));
              await addPrivateAlert(
                myEvent.id,
                req.body.allDay,
                alert.type,
                alert.time,
                alert.hour,
                alert.minute,
                content,
                date,
                req.myId,
                req.app.get("io"),
                req.app.get("onlineUsers")
              );
            } else if (alert.type === "week") {
              const content = `${req.body.eventName}시작 ${alert.time}주 전 입니다`;
              const date = new Date(req.body.startTime);
              date.setDate(date.getDate() - alert.time * 7);
              date.setHours(alert.hour);
              date.setMinutes(parseInt(alert.minute ? alert.minute : 0));
              await addPrivateAlert(
                myEvent.id,
                req.body.allDay,
                alert.type,
                alert.time,
                alert.hour,
                alert.minute,
                content,
                date,
                req.myId,
                req.app.get("io"),
                req.app.get("onlineUsers")
              );
            }
          })
        );
      } else {
        await Promise.all(
          req.body.alerts.map(async (alert) => {
            if (alert.type === "minute") {
              const content = `${req.body.eventName}시작 ${alert.time}분 전입니다!`;
              const date = new Date(req.body.startTime);
              date.setMinutes(date.getMinutes() - parseInt(alert.time));
              await addPrivateAlert(
                myEvent.id,
                req.body.allDay,
                alert.type,
                alert.time,
                null,
                null,
                content,
                date,
                req.myId,
                req.app.get("io"),
                req.app.get("onlineUsers")
              );
            } else if (alert.type === "hour") {
              const content = `${req.body.eventName}시작 ${alert.time}시간 전입니다!`;
              const date = new Date(req.body.startTime);
              date.setHours(date.getHours() - parseInt(alert.time));
              await addPrivateAlert(
                myEvent.id,
                req.body.allDay,
                alert.type,
                alert.time,
                null,
                null,
                content,
                date,
                req.myId,
                req.app.get("io"),
                req.app.get("onlineUsers")
              );
            } else if (alert.type === "day") {
              const content = `${req.body.eventName}시작 ${alert.time}일 전입니다!`;
              const date = new Date(req.body.startTime);
              date.setDate(date.getDate() - parseInt(alert.time));
              await addPrivateAlert(
                myEvent.id,
                req.body.allDay,
                alert.type,
                alert.time,
                null,
                null,
                content,
                date,
                req.myId,
                req.app.get("io"),
                req.app.get("onlineUsers")
              );
            } else if (alert.type === "week") {
              const content = `${req.body.eventName}시작 ${alert.time}주 전입니다!`;
              const date = new Date(req.body.startTime);
              date.setDate(date.getDate() - parseInt(alert.time) * 7);
              await addPrivateAlert(
                myEvent.id,
                req.body.allDay,
                alert.type,
                alert.time,
                null,
                null,
                content,
                date,
                req.myId,
                req.app.get("io"),
                req.app.get("onlineUsers")
              );
            }
          })
        );
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.post("/editPrivateEventColor", authJWT, async (req, res, next) => {
  try {
    const myEvent = await PrivateEvent.findOne({
      where: { id: req.body.eventId },
    });

    if (!myEvent) {
      res
        .status(400)
        .json({ message: "수정할 개인이벤트의 조회 결과가 없습니다" });
    }

    await sequelize.transaction(async (t) => {
      await myEvent.update(
        {
          color: req.body.color,
        },
        { transaction: t }
      );
    });

    return res.status(200).json(myEvent);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//개인 이벤트 삭제
router.post("/deletePrivateEvent", authJWT, async (req, res, next) => {
  try {
    await sequelize.transaction(async (t) => {
      await deletePrivateAlerts(req.myId, req.body.eventId);

      await PrivateEvent.destroy({
        where: { id: req.body.eventId },
        transaction: t,
        force: true,
      });
    });

    return res.status(200).send({ success: true });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;
