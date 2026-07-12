export const updateProfileDto = (data) => {
  const allowedFields = [
    'phone',
    'birthDate',
    'story',
    'emailPersonal',
    'nameSchool',
    'nameClass',
    'major',
    'department',
    'title'
  ];

  const dto = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      dto[key] = data[key];
    }
  }
  return dto;
};
